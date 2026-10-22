/**
 * Media archiving — download Instagram media into the NextPress Media Library.
 *
 * This is what makes the archive durable. Instagram's `media_url` is a signed
 * CDN URL that expires, and is sometimes absent entirely (copyrighted audio,
 * downloads disabled). Storing it in the database would leave the site with
 * dead images in weeks.
 *
 * SECURITY — this module fetches a URL supplied by a third party, so it is
 * treated as hostile input:
 *   - HTTPS only.
 *   - Host must match Instagram's CDN allowlist (blocks SSRF to internal
 *     services, cloud metadata endpoints, and localhost).
 *   - Redirects are followed manually and re-validated at every hop, because
 *     an allowed host may redirect to a forbidden one.
 *   - Hard timeout and byte cap, enforced while streaming, so an endless or
 *     enormous response cannot exhaust memory.
 *   - Content-Type is checked against an allowlist AND verified against the
 *     file's magic bytes; a lying header does not decide what gets stored.
 */

import type { AuthContext } from "@nextpress/core/auth/auth-types";
import type { MediaAssetDto } from "@nextpress/core/media/media-types";
import { InstagramMediaError, InstagramNetworkError } from "../api/instagram-errors";
import { logger } from "./logger";

/**
 * Instagram/Facebook CDN hosts. Media is only ever fetched from these.
 * Matching is suffix-based on the parsed hostname — never a substring test,
 * which `evil-cdninstagram.com.attacker.net` would defeat.
 */
const ALLOWED_HOST_SUFFIXES = [
  ".cdninstagram.com",
  ".fbcdn.net",
  ".instagram.com",
] as const;

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // Matches NextPress MAX_FILE_SIZE.
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 3;

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
]);

/** Magic-byte signatures, so a spoofed Content-Type cannot smuggle a file in. */
const MAGIC_BYTES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: "image/webp",
    test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  // ISO-BMFF: 'ftyp' box at offset 4 covers MP4 and MOV.
  { mime: "video/mp4", test: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" },
];

export function isAllowedMediaUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) || host === suffix.slice(1),
  );
}

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Download media from an Instagram CDN URL with full SSRF protection.
 *
 * Redirects are handled with `redirect: "manual"` rather than letting fetch
 * follow them, because fetch would happily follow an allowed host's redirect
 * to 169.254.169.254 and hand back cloud credentials.
 */
export async function downloadMedia(
  url: string,
  mediaId: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<DownloadedMedia> {
  let currentUrl = url;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    if (!isAllowedMediaUrl(currentUrl)) {
      throw InstagramMediaError({
        message: `Refusing to download Instagram media from a non-allowlisted URL (media ${mediaId})`,
        userMessage: "This media could not be archived because it is hosted on an unexpected domain.",
      });
    }

    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch (cause) {
      throw InstagramNetworkError({
        message: `Failed to download Instagram media ${mediaId}`,
        cause,
      });
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw InstagramMediaError({
          message: `Instagram media ${mediaId} returned a redirect without a location`,
        });
      }
      // Re-validated at the top of the next iteration.
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw InstagramNetworkError({
        message: `Instagram media ${mediaId} download failed with HTTP ${response.status}`,
      });
    }

    return readBody(response, mediaId);
  }

  throw InstagramMediaError({
    message: `Instagram media ${mediaId} exceeded the redirect limit`,
  });
}

async function readBody(response: Response, mediaId: string): Promise<DownloadedMedia> {
  const declaredType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase() ?? "";

  if (declaredType && !ALLOWED_CONTENT_TYPES.has(declaredType)) {
    throw InstagramMediaError({
      message: `Instagram media ${mediaId} has unsupported content type "${declaredType}"`,
      userMessage: "This media type cannot be archived.",
    });
  }

  // Reject on the advertised length before reading a single byte.
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
    throw InstagramMediaError({
      message: `Instagram media ${mediaId} is ${declaredLength} bytes, exceeding the archive limit`,
      userMessage: "This media is too large to archive.",
    });
  }

  const buffer = await readCapped(response, mediaId);

  // The header is a claim; the bytes are the evidence.
  const sniffed = sniffMimeType(buffer);
  if (!sniffed) {
    throw InstagramMediaError({
      message: `Instagram media ${mediaId} is not a recognised image or video file`,
      userMessage: "This media could not be archived because its format was not recognised.",
    });
  }

  return {
    buffer,
    mimeType: sniffed,
    filename: `instagram-${mediaId}${extensionFor(sniffed)}`,
  };
}

/**
 * Stream the body, aborting the moment the cap is exceeded.
 *
 * A Content-Length header is not trustworthy, so the limit is also enforced
 * during the read — otherwise a lying server could still exhaust memory.
 */
async function readCapped(response: Response, mediaId: string): Promise<Buffer> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_DOWNLOAD_BYTES) {
      throw InstagramMediaError({ message: `Instagram media ${mediaId} exceeded the size limit` });
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw InstagramMediaError({
          message: `Instagram media ${mediaId} exceeded the ${MAX_DOWNLOAD_BYTES} byte archive limit`,
          userMessage: "This media is too large to archive.",
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

export function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  return MAGIC_BYTES.find((sig) => sig.test(buffer))?.mime ?? null;
}

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "video/mp4":
      return ".mp4";
    default:
      return "";
  }
}

// ── Archiving into the Media Library ──

/** Minimal surface of the core media service, so this module stays testable. */
export interface MediaUploader {
  upload(
    auth: AuthContext,
    buffer: Buffer,
    input: {
      filename: string;
      mimeType: string;
      size: number;
      alt?: string;
      title?: string;
      caption?: string;
    },
  ): Promise<MediaAssetDto>;
}

export interface ArchiveMediaOptions {
  auth: AuthContext;
  uploader: MediaUploader;
  url: string;
  mediaId: string;
  alt?: string;
  caption?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Download one Instagram media file and store it via the Media Library.
 *
 * Uses the existing NextPress storage abstraction, so archived media lands in
 * local disk or S3 exactly like any other upload, with variants generated.
 */
export async function archiveMedia(options: ArchiveMediaOptions): Promise<MediaAssetDto> {
  const started = Date.now();

  const downloaded = await downloadMedia(options.url, options.mediaId, options.fetchImpl);

  const asset = await options.uploader.upload(options.auth, downloaded.buffer, {
    filename: downloaded.filename,
    mimeType: downloaded.mimeType,
    size: downloaded.buffer.length,
    alt: options.alt,
    title: `Instagram ${options.mediaId}`,
    caption: options.caption,
  });

  logger.info("instagram.media.archived", {
    siteId: options.auth.siteId,
    instagramMediaId: options.mediaId,
    durationMs: Date.now() - started,
    count: downloaded.buffer.length,
  });

  return asset;
}
