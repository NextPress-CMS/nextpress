/**
 * Publishing media validation.
 *
 * Instagram fetches the media itself and rejects the container with an opaque
 * code when something is wrong. Validating locally first turns "Error 400"
 * into an actionable sentence and saves a round trip against the publishing
 * quota.
 *
 * All limits below come from the current official content-publishing docs
 * (verified Sept 2026) and are declared as named constants so a future spec
 * change is a one-line edit rather than a hunt through conditionals.
 *
 * https://developers.facebook.com/docs/instagram-platform/content-publishing
 */

/** Images: JPEG only. PNG/WebP must be converted before publishing. */
export const IMAGE_SPEC = {
  mimeTypes: ["image/jpeg"] as const,
  maxBytes: 8 * 1024 * 1024,
  minWidth: 320,
  maxWidth: 1440,
  /** Portrait 4:5 through landscape 1.91:1. */
  minAspectRatio: 4 / 5,
  maxAspectRatio: 1.91,
} as const;

export const VIDEO_SPEC = {
  mimeTypes: ["video/mp4", "video/quicktime"] as const,
  maxBytes: 300 * 1024 * 1024,
  minDurationSeconds: 3,
  maxDurationSeconds: 15 * 60,
  maxWidth: 1920,
} as const;

/** A carousel holds 2–10 items. */
export const CAROUSEL_SPEC = { minItems: 2, maxItems: 10 } as const;

export const CAPTION_MAX_LENGTH = 2200;
/** alt_text is images-only and capped at 1000 characters (docs, Mar 2025). */
export const ALT_TEXT_MAX_LENGTH = 1000;

export interface MediaCandidate {
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  url?: string;
}

export interface ValidationIssue {
  /** Stable code for tests and telemetry. */
  code: string;
  /** Actionable sentence shown to an admin. Never a raw API string. */
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const ok: ValidationResult = { valid: true, issues: [] };

function fail(issues: ValidationIssue[]): ValidationResult {
  return { valid: issues.length === 0, issues };
}

export function validateImage(media: MediaCandidate): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!(IMAGE_SPEC.mimeTypes as readonly string[]).includes(media.mimeType)) {
    issues.push({
      code: "image_format",
      message: `Instagram only accepts JPEG images. This file is ${media.mimeType}. Convert it to JPEG and try again.`,
    });
  }

  if (media.size > IMAGE_SPEC.maxBytes) {
    issues.push({
      code: "image_size",
      message: `This image is ${formatMb(media.size)}, above Instagram's ${formatMb(IMAGE_SPEC.maxBytes)} limit.`,
    });
  }

  // Dimensions are optional: some assets have no stored dimensions, and an
  // unknown value is not evidence of a violation.
  if (media.width != null) {
    if (media.width < IMAGE_SPEC.minWidth) {
      issues.push({
        code: "image_width_min",
        message: `This image is ${media.width}px wide. Instagram requires at least ${IMAGE_SPEC.minWidth}px.`,
      });
    } else if (media.width > IMAGE_SPEC.maxWidth) {
      issues.push({
        code: "image_width_max",
        message: `This image is ${media.width}px wide. Instagram accepts at most ${IMAGE_SPEC.maxWidth}px — resize it before publishing.`,
      });
    }
  }

  if (media.width != null && media.height != null && media.height > 0) {
    const ratio = media.width / media.height;
    if (ratio < IMAGE_SPEC.minAspectRatio || ratio > IMAGE_SPEC.maxAspectRatio) {
      issues.push({
        code: "image_aspect_ratio",
        message: `This image's aspect ratio (${ratio.toFixed(2)}:1) is outside Instagram's accepted range of 0.80:1 (portrait) to 1.91:1 (landscape). Crop it and try again.`,
      });
    }
  }

  return fail(issues);
}

export function validateVideo(media: MediaCandidate): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!(VIDEO_SPEC.mimeTypes as readonly string[]).includes(media.mimeType)) {
    issues.push({
      code: "video_format",
      message: `Instagram only accepts MP4 or MOV video. This file is ${media.mimeType}.`,
    });
  }

  if (media.size > VIDEO_SPEC.maxBytes) {
    issues.push({
      code: "video_size",
      message: `This video is ${formatMb(media.size)}, above Instagram's ${formatMb(VIDEO_SPEC.maxBytes)} limit.`,
    });
  }

  if (media.duration != null) {
    if (media.duration < VIDEO_SPEC.minDurationSeconds) {
      issues.push({
        code: "video_duration_min",
        message: `This video is ${media.duration}s long. Instagram requires at least ${VIDEO_SPEC.minDurationSeconds}s.`,
      });
    } else if (media.duration > VIDEO_SPEC.maxDurationSeconds) {
      issues.push({
        code: "video_duration_max",
        message: `This video is ${Math.round(media.duration / 60)} minutes long. Instagram accepts at most ${VIDEO_SPEC.maxDurationSeconds / 60} minutes.`,
      });
    }
  }

  if (media.width != null && media.width > VIDEO_SPEC.maxWidth) {
    issues.push({
      code: "video_width",
      message: `This video is ${media.width}px wide. Instagram accepts at most ${VIDEO_SPEC.maxWidth}px.`,
    });
  }

  return fail(issues);
}

export function validateCarousel(items: MediaCandidate[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (items.length < CAROUSEL_SPEC.minItems) {
    issues.push({
      code: "carousel_min_items",
      message: `An Instagram carousel needs at least ${CAROUSEL_SPEC.minItems} items. ${items.length} selected.`,
    });
  }

  if (items.length > CAROUSEL_SPEC.maxItems) {
    issues.push({
      code: "carousel_max_items",
      message: `An Instagram carousel accepts at most ${CAROUSEL_SPEC.maxItems} items. ${items.length} selected.`,
    });
  }

  // Validate each child so the admin sees exactly which slide is the problem.
  items.forEach((item, index) => {
    const result = item.mimeType.startsWith("video/") ? validateVideo(item) : validateImage(item);
    for (const issue of result.issues) {
      issues.push({ code: `carousel_item_${issue.code}`, message: `Item ${index + 1}: ${issue.message}` });
    }
  });

  return fail(issues);
}

export function validateCaption(caption: string | undefined): ValidationResult {
  if (!caption) return ok;
  if (caption.length > CAPTION_MAX_LENGTH) {
    return fail([
      {
        code: "caption_length",
        message: `The Instagram caption is ${caption.length} characters. Instagram allows at most ${CAPTION_MAX_LENGTH}.`,
      },
    ]);
  }
  return ok;
}

/**
 * Instagram fetches publish media over the public internet, so an
 * authenticated, private, or localhost URL will silently fail at Meta's end.
 * Catching it here explains the real problem.
 */
export function validatePublicUrl(url: string): ValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail([{ code: "url_invalid", message: "The media URL is not a valid URL." }]);
  }

  if (parsed.protocol !== "https:") {
    return fail([
      {
        code: "url_not_https",
        message: "Instagram can only fetch media over HTTPS. Configure a public HTTPS site URL.",
      },
    ]);
  }

  const host = parsed.hostname.toLowerCase();
  if (isNonPublicHost(host)) {
    return fail([
      {
        code: "url_not_public",
        message:
          "Instagram must be able to download this media from the public internet. Local and private addresses are unreachable from Instagram's servers.",
      },
    ]);
  }

  return ok;
}

function isNonPublicHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return true;
  if (host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  // RFC1918 and link-local ranges.
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}

/** Full pre-flight check for a single publish request. */
export function validatePublishRequest(input: {
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL";
  items: MediaCandidate[];
  caption?: string;
  altText?: string;
}): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (input.items.length === 0) {
    issues.push({
      code: "no_media",
      message: "Select at least one image or video before publishing to Instagram.",
    });
    return fail(issues);
  }

  if (input.mediaType === "CAROUSEL") {
    issues.push(...validateCarousel(input.items).issues);
  } else {
    const first = input.items[0] as MediaCandidate;
    issues.push(
      ...(input.mediaType === "VIDEO" ? validateVideo(first) : validateImage(first)).issues,
    );
  }

  issues.push(...validateCaption(input.caption).issues);

  for (const item of input.items) {
    if (item.url) issues.push(...validatePublicUrl(item.url).issues);
  }

  if (input.altText && input.altText.length > ALT_TEXT_MAX_LENGTH) {
    issues.push({
      code: "alt_text_length",
      message: `Alt text is ${input.altText.length} characters. Instagram allows at most ${ALT_TEXT_MAX_LENGTH}.`,
    });
  }

  return fail(issues);
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
