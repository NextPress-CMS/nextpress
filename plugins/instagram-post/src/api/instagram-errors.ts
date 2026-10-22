/**
 * Instagram Error Model
 *
 * Every failure crossing the Instagram boundary becomes one of these typed
 * errors. Callers branch on `category` and `retryable` — never on strings.
 *
 * Two rules that shape this file:
 *
 *   1. Raw Graph API payloads never reach an end user. `message` is the
 *      developer-facing detail; `userMessage` is what the admin UI shows.
 *   2. `retryable` is decided ONCE, here, from the Graph error code. Services
 *      must not re-derive it, otherwise retry policy drifts between callers.
 *
 * Graph error envelope (docs: /docs/graph-api/guides/error-handling):
 *   { error: { message, type, code, error_subcode, fbtrace_id } }
 */

export type InstagramErrorCategory =
  | "auth"
  | "permission"
  | "rate_limit"
  | "validation"
  | "media"
  | "publishing"
  | "network"
  | "unknown";

export interface InstagramErrorOptions {
  /** Developer-facing detail. Never rendered raw in the admin UI. */
  message: string;
  /** Safe, actionable text for admins. */
  userMessage?: string;
  /** Graph API numeric code, when the failure came from Meta. */
  externalErrorCode?: number;
  /** Graph API error_subcode — distinguishes token failure modes. */
  externalErrorSubcode?: number;
  /** Meta's trace id, useful in support tickets. Safe to log. */
  fbtraceId?: string;
  /** Suggested wait before the next attempt, in seconds. */
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class InstagramError extends Error {
  readonly category: InstagramErrorCategory;
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly externalErrorCode?: number;
  readonly externalErrorSubcode?: number;
  readonly fbtraceId?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    category: InstagramErrorCategory,
    retryable: boolean,
    options: InstagramErrorOptions,
  ) {
    super(options.message, { cause: options.cause });
    this.name = "InstagramError";
    this.category = category;
    this.retryable = retryable;
    this.userMessage = options.userMessage ?? DEFAULT_USER_MESSAGES[category];
    this.externalErrorCode = options.externalErrorCode;
    this.externalErrorSubcode = options.externalErrorSubcode;
    this.fbtraceId = options.fbtraceId;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /** Shape persisted in sync state and rendered by the admin UI. */
  toJSON(): {
    category: InstagramErrorCategory;
    message: string;
    retryable: boolean;
    externalErrorCode?: number;
  } {
    return {
      category: this.category,
      message: this.userMessage,
      retryable: this.retryable,
      ...(this.externalErrorCode !== undefined && {
        externalErrorCode: this.externalErrorCode,
      }),
    };
  }
}

const DEFAULT_USER_MESSAGES: Record<InstagramErrorCategory, string> = {
  auth: "Your Instagram authorisation is no longer valid. Reconnect the account to continue.",
  permission:
    "Instagram refused this request because the connected account is missing a required permission.",
  rate_limit:
    "Instagram is temporarily rate limiting this site. The operation will be retried automatically.",
  validation: "Instagram rejected the request because some of the supplied data was invalid.",
  media:
    "The selected media does not meet Instagram's current publishing requirements. Replace the media and try again.",
  publishing: "Instagram could not publish this post.",
  network: "Instagram could not be reached. The operation will be retried automatically.",
  unknown: "An unexpected error occurred while talking to Instagram.",
};

// ── Constructors, one per category ──
//
// These exist so call sites read as intent ("this is an auth failure") rather
// than as three positional arguments whose meaning must be looked up.

export const InstagramAuthError = (o: InstagramErrorOptions): InstagramError =>
  new InstagramError("auth", false, o);

export const InstagramPermissionError = (o: InstagramErrorOptions): InstagramError =>
  new InstagramError("permission", false, o);

export const InstagramRateLimitError = (o: InstagramErrorOptions): InstagramError =>
  new InstagramError("rate_limit", true, o);

export const InstagramValidationError = (o: InstagramErrorOptions): InstagramError =>
  new InstagramError("validation", false, o);

export const InstagramMediaError = (o: InstagramErrorOptions): InstagramError =>
  new InstagramError("media", false, o);

export const InstagramPublishingError = (
  o: InstagramErrorOptions & { retryable?: boolean },
): InstagramError => new InstagramError("publishing", o.retryable ?? false, o);

export const InstagramNetworkError = (o: InstagramErrorOptions): InstagramError =>
  new InstagramError("network", true, o);

export const InstagramUnknownError = (o: InstagramErrorOptions): InstagramError =>
  new InstagramError("unknown", false, o);

// ── Graph API error code classification ──

/**
 * Token is dead or revoked. Subcodes distinguish *why*, which matters because
 * only some of them are the user's fault:
 *   458 app unauthorised · 460 password changed
 *   463 token expired    · 467 token invalid
 */
const AUTH_CODES = new Set([102, 190]);

/** 4 app-level · 17 user-level · 32 page-level · 613 custom · 80002 IG BUC. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80002]);

/** 10 and the 200-series are "app does not have permission for this action". */
const PERMISSION_CODES = new Set([10, 200, 803]);

/** 1/2 are Meta-side transient faults; 341 is "application limit reached". */
const TRANSIENT_CODES = new Set([1, 2, 341]);

/**
 * Map a Graph API error envelope onto a typed error.
 *
 * Anything unrecognised becomes a NON-retryable unknown error. That direction
 * is deliberate: retrying an error we do not understand risks hammering Meta
 * (or duplicating a publish), while not retrying merely surfaces it to an admin.
 */
export function classifyGraphError(
  error: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    error_user_msg?: string;
  },
  context: string,
): InstagramError {
  const code = error.code;
  const message = `${context}: ${error.message ?? "Unknown Instagram error"}${
    code !== undefined ? ` (code ${code})` : ""
  }`;

  const base: InstagramErrorOptions = {
    message,
    externalErrorCode: code,
    externalErrorSubcode: error.error_subcode,
    fbtraceId: error.fbtrace_id,
    // error_user_msg is Meta's own end-user-safe string when present.
    ...(error.error_user_msg && { userMessage: error.error_user_msg }),
  };

  if (code !== undefined && AUTH_CODES.has(code)) return InstagramAuthError(base);
  if (code !== undefined && RATE_LIMIT_CODES.has(code)) return InstagramRateLimitError(base);
  if (code !== undefined && PERMISSION_CODES.has(code)) return InstagramPermissionError(base);
  if (code !== undefined && TRANSIENT_CODES.has(code)) {
    return new InstagramError("network", true, base);
  }
  if (error.type === "OAuthException") return InstagramAuthError(base);
  if (code === 100) return InstagramValidationError(base);

  return InstagramUnknownError(base);
}

/** Type guard so `catch (e: unknown)` blocks stay type-safe. */
export function isInstagramError(e: unknown): e is InstagramError {
  return e instanceof InstagramError;
}
