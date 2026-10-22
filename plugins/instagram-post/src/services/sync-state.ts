/**
 * Synchronisation state machines.
 *
 * Import and publish each have an explicit state graph. Illegal transitions
 * are rejected rather than silently applied, because the two states that
 * matter most — IMPORTING and PUBLISHING — are exactly the ones where a
 * concurrent writer would otherwise create a duplicate.
 *
 * Publishing is the stricter of the two: PUBLISHED is terminal. Once Instagram
 * has the post, no code path may walk it back to a state that permits another
 * publish attempt.
 */

import type { InstagramError } from "../api/instagram-errors";

// ── Import ──

export const IMPORT_STATES = [
  "NOT_IMPORTED",
  "IMPORT_PENDING",
  "IMPORTING",
  "IMPORTED",
  "IMPORT_FAILED",
  "RETRY_PENDING",
] as const;

export type ImportState = (typeof IMPORT_STATES)[number];

const IMPORT_TRANSITIONS: Record<ImportState, readonly ImportState[]> = {
  NOT_IMPORTED: ["IMPORT_PENDING", "IMPORTING"],
  IMPORT_PENDING: ["IMPORTING", "IMPORT_FAILED"],
  IMPORTING: ["IMPORTED", "IMPORT_FAILED", "RETRY_PENDING"],
  // Re-importing an existing post is legal: it refreshes a caption edited on
  // Instagram. It must never create a second entry — the media-id lookup in
  // the import service guarantees that.
  IMPORTED: ["IMPORTING"],
  IMPORT_FAILED: ["RETRY_PENDING", "IMPORTING"],
  RETRY_PENDING: ["IMPORTING", "IMPORT_FAILED"],
};

// ── Publish ──

export const PUBLISH_STATES = [
  "NOT_PUBLISHED",
  "PUBLISH_PENDING",
  "PUBLISHING",
  "PUBLISHED",
  "PUBLISH_FAILED",
  "RETRY_PENDING",
] as const;

export type PublishState = (typeof PUBLISH_STATES)[number];

const PUBLISH_TRANSITIONS: Record<PublishState, readonly PublishState[]> = {
  NOT_PUBLISHED: ["PUBLISH_PENDING", "PUBLISHING"],
  PUBLISH_PENDING: ["PUBLISHING", "PUBLISH_FAILED"],
  // PUBLISHING may resolve to PUBLISHED via reconciliation, not just via a
  // successful direct response.
  PUBLISHING: ["PUBLISHED", "PUBLISH_FAILED", "RETRY_PENDING"],
  /** Terminal. Instagram has the post; there is nothing safe to retry. */
  PUBLISHED: [],
  PUBLISH_FAILED: ["RETRY_PENDING", "PUBLISHING"],
  RETRY_PENDING: ["PUBLISHING", "PUBLISH_FAILED"],
};

export function canTransitionImport(from: ImportState, to: ImportState): boolean {
  return IMPORT_TRANSITIONS[from].includes(to);
}

export function canTransitionPublish(from: PublishState, to: PublishState): boolean {
  return PUBLISH_TRANSITIONS[from].includes(to);
}

export class InvalidStateTransitionError extends Error {
  constructor(
    readonly machine: "import" | "publish",
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid ${machine} state transition: ${from} → ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

export function assertImportTransition(from: ImportState, to: ImportState): void {
  if (!canTransitionImport(from, to)) {
    throw new InvalidStateTransitionError("import", from, to);
  }
}

export function assertPublishTransition(from: PublishState, to: PublishState): void {
  if (!canTransitionPublish(from, to)) {
    throw new InvalidStateTransitionError("publish", from, to);
  }
}

// ── Retry policy ──

export const MAX_RETRIES = 5;

/** Base delay for exponential backoff. */
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  reason: string;
}

/**
 * Decide whether a failed operation gets another attempt.
 *
 * Two rules do the real work:
 *   - A non-retryable error (bad media, revoked token) is never retried.
 *     Repeating it just burns quota and hides the real problem from the admin.
 *   - When Instagram tells us how long to wait, that wins over our own
 *     backoff curve — Meta knows its own rate-limit window.
 */
export function decideRetry(error: InstagramError, retryCount: number): RetryDecision {
  if (!error.retryable) {
    return { shouldRetry: false, delayMs: 0, reason: `Permanent failure (${error.category})` };
  }

  if (retryCount >= MAX_RETRIES) {
    return {
      shouldRetry: false,
      delayMs: 0,
      reason: `Retry limit reached (${retryCount}/${MAX_RETRIES})`,
    };
  }

  if (error.retryAfterSeconds !== undefined) {
    return {
      shouldRetry: true,
      delayMs: Math.min(error.retryAfterSeconds * 1000, MAX_BACKOFF_MS),
      reason: "Honouring Instagram's rate-limit wait hint",
    };
  }

  // Exponential backoff with jitter. Jitter matters for multi-site installs:
  // without it, every site retries on the same tick and re-creates the storm.
  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** retryCount, MAX_BACKOFF_MS);
  const jitter = Math.floor(Math.random() * (exponential * 0.2));

  return {
    shouldRetry: true,
    delayMs: exponential + jitter,
    reason: `Transient failure (${error.category}), attempt ${retryCount + 1}/${MAX_RETRIES}`,
  };
}
