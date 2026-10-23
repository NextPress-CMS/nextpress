/**
 * FakeInstagramClient — the test double for every service.
 *
 * No test in this plugin touches the real Instagram API. This implementation
 * honours the same `InstagramClient` contract, including the parts that are
 * easy to forget and expensive to get wrong: cursor pagination, asynchronous
 * video container processing, and quota exhaustion.
 *
 * Failures are injected per-method so a test can reproduce an expired token,
 * a rate limit, or a lost publish response deterministically.
 */

import {
  InstagramAuthError,
  InstagramNetworkError,
  InstagramRateLimitError,
  type InstagramError,
} from "./instagram-errors";
import type {
  InstagramAccount,
  InstagramClient,
  InstagramContainer,
  InstagramContainerStatus,
  InstagramMedia,
  InstagramMediaPage,
  InstagramPublishInput,
  InstagramPublishedMedia,
  InstagramPublishingLimit,
} from "./instagram-types";

export type FakeFailure = "auth" | "rate_limit" | "network" | null;

export interface FakeInstagramClientOptions {
  account?: Partial<InstagramAccount>;
  media?: InstagramMedia[];
  pageSize?: number;
  /** Quota reported by getPublishingLimit. */
  publishingLimit?: { used: number; total: number };
  /** Containers requiring N status polls before reporting FINISHED. */
  videoProcessingPolls?: number;
}

export class FakeInstagramClient implements InstagramClient {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  /** Per-method failure injection. Cleared with `clearFailures()`. */
  failures: Partial<Record<keyof InstagramClient, FakeFailure>> = {};

  /** Containers created during the test, by id. */
  readonly containers = new Map<
    string,
    { input: InstagramPublishInput; polls: number; published: boolean; forcedStatus?: InstagramContainerStatus["status_code"] }
  >();

  /** Media ids passed to publishContainer — proves no double publish. */
  readonly publishedContainerIds: string[] = [];

  private readonly account: InstagramAccount;
  private readonly media: InstagramMedia[];
  private readonly pageSize: number;
  private publishingLimit: { used: number; total: number };
  private readonly videoProcessingPolls: number;
  private counter = 0;

  constructor(options: FakeInstagramClientOptions = {}) {
    this.account = {
      id: "17841400000000000",
      username: "example_account",
      account_type: "BUSINESS",
      media_count: options.media?.length ?? 0,
      ...options.account,
    };
    this.media = options.media ?? [];
    this.pageSize = options.pageSize ?? 25;
    this.publishingLimit = options.publishingLimit ?? { used: 0, total: 50 };
    this.videoProcessingPolls = options.videoProcessingPolls ?? 0;
  }

  clearFailures(): void {
    this.failures = {};
  }

  /** Force a specific container into a state (EXPIRED, ERROR, PUBLISHED…). */
  setContainerStatus(containerId: string, status: InstagramContainerStatus["status_code"]): void {
    const container = this.containers.get(containerId);
    if (container) container.forcedStatus = status;
  }

  // ── InstagramClient ──

  async getAccount(): Promise<InstagramAccount> {
    this.record("getAccount", []);
    this.maybeFail("getAccount");
    return this.account;
  }

  async listMedia(cursor?: string, limit?: number): Promise<InstagramMediaPage> {
    this.record("listMedia", [cursor, limit]);
    this.maybeFail("listMedia");

    const size = limit ?? this.pageSize;
    // The cursor is an opaque offset — exactly how a caller must treat it.
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const items = this.media.slice(start, start + size);
    const nextIndex = start + items.length;

    return {
      items,
      nextCursor: nextIndex < this.media.length ? String(nextIndex) : null,
    };
  }

  async getMedia(mediaId: string): Promise<InstagramMedia> {
    this.record("getMedia", [mediaId]);
    this.maybeFail("getMedia");

    const found = this.media.find((m) => m.id === mediaId);
    if (!found) throw InstagramNetworkError({ message: `Media ${mediaId} not found` });
    return found;
  }

  async createMediaContainer(input: InstagramPublishInput): Promise<InstagramContainer> {
    this.record("createMediaContainer", [input]);
    this.maybeFail("createMediaContainer");

    const id = `container-${++this.counter}`;
    // Videos need polling; images are ready immediately.
    const polls = input.mediaType === "VIDEO" || input.mediaType === "REELS"
      ? this.videoProcessingPolls
      : 0;

    this.containers.set(id, { input, polls, published: false });
    return { id };
  }

  async getContainerStatus(containerId: string): Promise<InstagramContainerStatus> {
    this.record("getContainerStatus", [containerId]);
    this.maybeFail("getContainerStatus");

    const container = this.containers.get(containerId);
    if (!container) {
      return { id: containerId, status_code: "ERROR", status: "Unknown container" };
    }

    if (container.forcedStatus) {
      return { id: containerId, status_code: container.forcedStatus };
    }

    if (container.published) return { id: containerId, status_code: "PUBLISHED" };

    if (container.polls > 0) {
      container.polls--;
      return { id: containerId, status_code: "IN_PROGRESS" };
    }

    return { id: containerId, status_code: "FINISHED" };
  }

  async publishContainer(containerId: string): Promise<InstagramPublishedMedia> {
    this.record("publishContainer", [containerId]);
    this.publishedContainerIds.push(containerId);

    const container = this.containers.get(containerId);
    if (container) container.published = true;

    // The injected failure fires AFTER the container is marked published, which
    // is what a "network" failure really models: Instagram accepted the post
    // and the RESPONSE was lost. Failing before this point would model a
    // rejected request and would let a blind retry look safe when it is not.
    this.maybeFail("publishContainer");

    this.publishingLimit = {
      ...this.publishingLimit,
      used: this.publishingLimit.used + 1,
    };

    return { id: `ig-media-${++this.counter}` };
  }

  async getPublishingLimit(): Promise<InstagramPublishingLimit> {
    this.record("getPublishingLimit", []);
    this.maybeFail("getPublishingLimit");

    return {
      used: this.publishingLimit.used,
      total: this.publishingLimit.total,
      remaining: Math.max(0, this.publishingLimit.total - this.publishingLimit.used),
    };
  }

  // ── Internals ──

  private record(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
  }

  countCalls(method: keyof InstagramClient): number {
    return this.calls.filter((c) => c.method === method).length;
  }

  private maybeFail(method: keyof InstagramClient): void {
    const failure = this.failures[method];
    if (!failure) return;
    throw makeFailure(failure);
  }
}

function makeFailure(kind: Exclude<FakeFailure, null>): InstagramError {
  switch (kind) {
    case "auth":
      return InstagramAuthError({
        message: "Error validating access token: Session has expired",
        externalErrorCode: 190,
        externalErrorSubcode: 463,
      });
    case "rate_limit":
      return InstagramRateLimitError({
        message: "Application request limit reached",
        externalErrorCode: 4,
        retryAfterSeconds: 600,
      });
    case "network":
      return InstagramNetworkError({ message: "Instagram request timed out" });
  }
}
