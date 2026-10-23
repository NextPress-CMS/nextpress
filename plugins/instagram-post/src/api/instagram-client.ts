/**
 * Instagram API Client
 *
 * The ONLY place in the plugin that performs HTTP against Instagram. Everything
 * above it depends on the `InstagramClient` interface, so the API can change
 * shape without touching CMS logic.
 *
 * Host: graph.instagram.com (Instagram API with Instagram Login)
 *
 * Invariants enforced here:
 *   - The access token travels as a POST body field or a query param that is
 *     never logged. `describeRequest()` redacts it before any log line.
 *   - Every response body is Zod-parsed. Unvalidated JSON never escapes.
 *   - Every request is bounded by a timeout — a hung socket must not hold a
 *     cron run open forever.
 *   - Rate-limit headers are surfaced as typed errors with a wait hint.
 */

import {
  classifyGraphError,
  InstagramNetworkError,
  InstagramRateLimitError,
  InstagramUnknownError,
  InstagramValidationError,
} from "./instagram-errors";
import {
  graphErrorSchema,
  instagramAccountSchema,
  instagramContainerSchema,
  instagramContainerStatusSchema,
  instagramMediaPageSchema,
  instagramMediaSchema,
  instagramPublishedMediaSchema,
  instagramPublishingLimitSchema,
  type InstagramAccount,
  type InstagramClient,
  type InstagramContainer,
  type InstagramContainerStatus,
  type InstagramMedia,
  type InstagramMediaPage,
  type InstagramPublishInput,
  type InstagramPublishedMedia,
  type InstagramPublishingLimit,
} from "./instagram-types";

export const GRAPH_HOST = "https://graph.instagram.com";

/** Fields requested for every archived media item. */
const MEDIA_FIELDS = [
  "id",
  "media_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "caption",
  "timestamp",
  "username",
  "children{id,media_type,media_url,thumbnail_url}",
].join(",");

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_PAGE_SIZE = 25;

export interface InstagramApiClientOptions {
  accessToken: string;
  /** Instagram-scoped user id of the connected professional account. */
  accountId: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class InstagramApiClient implements InstagramClient {
  private readonly accessToken: string;
  private readonly accountId: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: InstagramApiClientOptions) {
    this.accessToken = options.accessToken;
    this.accountId = options.accountId;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  // ── Reading ──

  async getAccount(): Promise<InstagramAccount> {
    const json = await this.request("GET", "/me", {
      fields: "id,username,account_type,media_count,name,profile_picture_url",
    });
    return this.parse(instagramAccountSchema, json, "account");
  }

  async listMedia(cursor?: string, limit = DEFAULT_PAGE_SIZE): Promise<InstagramMediaPage> {
    const json = await this.request("GET", "/me/media", {
      fields: MEDIA_FIELDS,
      limit: String(limit),
      ...(cursor ? { after: cursor } : {}),
    });

    const page = this.parse(instagramMediaPageSchema, json, "media page");

    // `paging.next` absent means the walk is complete. Relying on the cursor
    // alone would loop forever, because Meta keeps returning a cursor on the
    // final page.
    const nextCursor = page.paging?.next ? (page.paging.cursors?.after ?? null) : null;

    return { items: page.data, nextCursor };
  }

  async getMedia(mediaId: string): Promise<InstagramMedia> {
    const json = await this.request("GET", `/${encodeURIComponent(mediaId)}`, {
      fields: MEDIA_FIELDS,
    });
    return this.parse(instagramMediaSchema, json, "media");
  }

  // ── Publishing ──

  async createMediaContainer(input: InstagramPublishInput): Promise<InstagramContainer> {
    const body: Record<string, string> = {};

    if (input.imageUrl) body.image_url = input.imageUrl;
    if (input.videoUrl) body.video_url = input.videoUrl;
    if (input.caption) body.caption = input.caption;
    if (input.altText) body.alt_text = input.altText;
    if (input.isCarouselItem) body.is_carousel_item = "true";
    if (input.children?.length) body.children = input.children.join(",");

    // IMAGE is the API default and must NOT be sent explicitly — Meta rejects
    // `media_type=IMAGE` on the container endpoint.
    if (input.mediaType !== "IMAGE") body.media_type = input.mediaType;

    const json = await this.request(
      "POST",
      `/${encodeURIComponent(this.accountId)}/media`,
      {},
      body,
    );
    return this.parse(instagramContainerSchema, json, "media container");
  }

  async getContainerStatus(containerId: string): Promise<InstagramContainerStatus> {
    const json = await this.request("GET", `/${encodeURIComponent(containerId)}`, {
      fields: "id,status_code,status",
    });
    return this.parse(instagramContainerStatusSchema, json, "container status");
  }

  async publishContainer(containerId: string): Promise<InstagramPublishedMedia> {
    const json = await this.request(
      "POST",
      `/${encodeURIComponent(this.accountId)}/media_publish`,
      {},
      { creation_id: containerId },
    );
    return this.parse(instagramPublishedMediaSchema, json, "published media");
  }

  async getPublishingLimit(): Promise<InstagramPublishingLimit> {
    const json = await this.request(
      "GET",
      `/${encodeURIComponent(this.accountId)}/content_publishing_limit`,
      { fields: "config,quota_usage" },
    );

    const parsed = this.parse(instagramPublishingLimitSchema, json, "publishing limit");
    const entry = parsed.data[0];

    // Fall back to the documented floor rather than assuming unlimited quota:
    // over-reporting headroom is what causes a hard rate-limit wall mid-run.
    const total = entry?.config?.quota_total ?? 50;
    const used = entry?.quota_usage ?? 0;

    return { used, total, remaining: Math.max(0, total - used) };
  }

  // ── Transport ──

  private async request(
    method: "GET" | "POST",
    path: string,
    query: Record<string, string> = {},
    body?: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(`${GRAPH_HOST}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    // GET carries the token in the query string (Meta's documented form);
    // POST carries it in the body so it never lands in an access log.
    if (method === "GET") url.searchParams.set("access_token", this.accessToken);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method,
        signal: controller.signal,
        ...(method === "POST"
          ? {
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ ...body, access_token: this.accessToken }).toString(),
            }
          : {}),
      });
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === "AbortError";
      throw InstagramNetworkError({
        message: aborted
          ? `Instagram request timed out after ${this.timeoutMs}ms: ${method} ${path}`
          : `Instagram request failed: ${method} ${path}`,
        cause,
      });
    } finally {
      clearTimeout(timer);
    }

    return this.handleResponse(response, `${method} ${path}`);
  }

  private async handleResponse(response: Response, context: string): Promise<unknown> {
    const text = await response.text();

    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw InstagramUnknownError({
        message: `${context}: Instagram returned a non-JSON response (HTTP ${response.status})`,
      });
    }

    if (response.ok) return json;

    // A 429 may arrive without a Graph error body, so handle it before parsing.
    if (response.status === 429) {
      throw InstagramRateLimitError({
        message: `${context}: Instagram rate limit reached (HTTP 429)`,
        retryAfterSeconds: parseRetryAfter(response.headers),
      });
    }

    const parsedError = graphErrorSchema.safeParse(json);
    if (parsedError.success) {
      const error = classifyGraphError(parsedError.data.error, context);
      // Meta does not send Retry-After, but it does send usage headers that
      // state how many minutes remain until access is regained.
      if (error.category === "rate_limit") {
        return Promise.reject(
          InstagramRateLimitError({
            message: error.message,
            externalErrorCode: error.externalErrorCode,
            fbtraceId: error.fbtraceId,
            retryAfterSeconds:
              parseRetryAfter(response.headers) ?? parseBusinessUseCaseWait(response.headers),
          }),
        );
      }
      throw error;
    }

    throw InstagramUnknownError({
      message: `${context}: Instagram returned HTTP ${response.status} with an unrecognised body`,
    });
  }

  /**
   * Parse a validated response. A schema mismatch is a validation error rather
   * than a crash, so one unexpected field cannot take down a whole sync run.
   */
  private parse<T>(
    schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: unknown } },
    value: unknown,
    what: string,
  ): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw InstagramValidationError({
        message: `Instagram returned an unexpected ${what} shape`,
        cause: result.error,
      });
    }
    return result.data;
  }
}

/** Standard HTTP Retry-After. Meta rarely sends it; honour it when present. */
function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/**
 * X-Business-Use-Case-Usage carries `estimated_time_to_regain_access` in
 * MINUTES. It is Meta's only real backoff signal, so it is worth mining.
 */
function parseBusinessUseCaseWait(headers: Headers): number | undefined {
  const raw = headers.get("x-business-use-case-usage");
  if (!raw) return undefined;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;

    let maxMinutes = 0;
    for (const entries of Object.values(parsed as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const minutes = (entry as { estimated_time_to_regain_access?: unknown })
          ?.estimated_time_to_regain_access;
        if (typeof minutes === "number" && minutes > maxMinutes) maxMinutes = minutes;
      }
    }

    return maxMinutes > 0 ? maxMinutes * 60 : undefined;
  } catch {
    return undefined;
  }
}
