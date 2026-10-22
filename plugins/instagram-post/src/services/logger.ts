/**
 * Structured logging for Instagram operations.
 *
 * Two jobs:
 *   1. Emit machine-parsable events with consistent identifiers.
 *   2. Guarantee that no credential is ever written to a log.
 *
 * The scrubber is not a nicety. Access tokens travel through error messages,
 * URLs, and `cause` chains; a single `console.error(err)` on a raw Graph
 * failure could otherwise persist a 60-day credential into a log aggregator.
 */

export type InstagramLogEvent =
  | "instagram.connection.created"
  | "instagram.connection.failed"
  | "instagram.connection.disconnected"
  | "instagram.token.refreshed"
  | "instagram.token.expired"
  | "instagram.sync.started"
  | "instagram.sync.completed"
  | "instagram.sync.failed"
  | "instagram.import.started"
  | "instagram.import.completed"
  | "instagram.import.failed"
  | "instagram.media.archived"
  | "instagram.media.failed"
  | "instagram.publish.started"
  | "instagram.publish.completed"
  | "instagram.publish.failed"
  | "instagram.publish.reconciled"
  | "instagram.rate_limit";

export interface InstagramLogFields {
  siteId?: string;
  contentEntryId?: string;
  instagramMediaId?: string;
  containerId?: string;
  operation?: string;
  status?: string;
  durationMs?: number;
  errorCode?: string | number;
  count?: number;
  [key: string]: unknown;
}

/**
 * Keys whose values are always replaced, whatever they contain.
 * Matched case-insensitively against a normalised key name.
 */
const SECRET_KEYS = [
  "accesstoken",
  "access_token",
  "token",
  "clientsecret",
  "client_secret",
  "appsecret",
  "app_secret",
  "code",
  "authorizationcode",
  "refreshtoken",
  "password",
  "secret",
];

const REDACTED = "[REDACTED]";

/**
 * Patterns that catch credentials embedded in free text — the case a
 * key-based denylist cannot see, e.g. an error message containing a URL with
 * `?access_token=IGQVJ...`.
 */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(access_token=)[^&\s"']+/gi, `$1${REDACTED}`],
  [/(client_secret=)[^&\s"']+/gi, `$1${REDACTED}`],
  [/(code=)[A-Za-z0-9_-]{20,}/gi, `$1${REDACTED}`],
  // Instagram long-lived tokens are long opaque IGQ*/EAA* strings.
  [/\b(IGQ|EAA)[A-Za-z0-9_-]{20,}\b/g, REDACTED],
];

export function scrubString(value: string): string {
  let out = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/**
 * Recursively redact a value. Depth-limited so a cyclic or pathological error
 * chain cannot turn a log call into a hang.
 */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth limit]";
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  if (value instanceof Error) {
    return { name: value.name, message: scrubString(value.message) };
  }

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEYS.includes(key.toLowerCase().replace(/[^a-z_]/g, ""))
      ? REDACTED
      : scrub(v, depth + 1);
  }
  return out;
}

export interface LogSink {
  info(event: string, fields: Record<string, unknown>): void;
  warn(event: string, fields: Record<string, unknown>): void;
  error(event: string, fields: Record<string, unknown>): void;
}

const consoleSink: LogSink = {
  info: (event, fields) => console.log(`[instagram] ${event}`, fields),
  warn: (event, fields) => console.warn(`[instagram] ${event}`, fields),
  error: (event, fields) => console.error(`[instagram] ${event}`, fields),
};

let sink: LogSink = consoleSink;

/** Swap the sink (tests, or a host-provided structured logger). */
export function setLogSink(next: LogSink): void {
  sink = next;
}

export function resetLogSink(): void {
  sink = consoleSink;
}

function emit(
  level: "info" | "warn" | "error",
  event: InstagramLogEvent,
  fields: InstagramLogFields,
): void {
  sink[level](event, scrub(fields) as Record<string, unknown>);
}

export const logger = {
  info: (event: InstagramLogEvent, fields: InstagramLogFields = {}) => emit("info", event, fields),
  warn: (event: InstagramLogEvent, fields: InstagramLogFields = {}) => emit("warn", event, fields),
  error: (event: InstagramLogEvent, fields: InstagramLogFields = {}) => emit("error", event, fields),
};
