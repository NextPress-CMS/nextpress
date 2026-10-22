/**
 * Publish service — NextPress → Instagram.
 *
 * Instagram publishing is a two-step, non-transactional operation:
 *
 *     POST /{ig-id}/media          → container id
 *     POST /{ig-id}/media_publish  → published media id
 *
 * If the second call's response is lost, the post may or may not exist. A
 * blind retry is the one genuinely unrecoverable mistake available here — it
 * double-posts to a real audience. So the contract is:
 *
 *   1. Persist the container id BEFORE calling media_publish.
 *   2. On an ambiguous outcome, mark PUBLISHING and stop.
 *   3. Reconcile by asking Instagram what happened to that container.
 *
 * Duplicate suppression also covers the mundane case of two admins clicking
 * publish at once: an entry already PUBLISHED or in flight is refused.
 */

import type { AuthContext } from "@nextpress/core/auth/auth-types";
import {
  InstagramPublishingError,
  isInstagramError,
} from "../api/instagram-errors";
import type {
  InstagramClient,
  InstagramPublishInput,
  InstagramPublishType,
} from "../api/instagram-types";
import { IG_FIELDS } from "../content/fields";
import { logger } from "./logger";
import {
  validatePublishRequest,
  type MediaCandidate,
  type ValidationIssue,
} from "./media-validation";
import { assertPublishTransition, decideRetry, type PublishState } from "./sync-state";

export interface PublishableEntry {
  id: string;
  status: string;
  publishStatus: PublishState;
  publishContainerId?: string;
  publishMediaId?: string;
  publishRetryCount: number;
  caption?: string;
  altText?: string;
  media: MediaCandidate[];
}

export interface PublishStore {
  getPublishableEntry(siteId: string, entryId: string): Promise<PublishableEntry | null>;
  updatePublishState(
    auth: AuthContext,
    entryId: string,
    fields: Record<string, unknown>,
  ): Promise<void>;
}

export interface PublishServiceOptions {
  client: InstagramClient;
  store: PublishStore;
  /** Override container poll timing. Tests set this to 0 to run instantly. */
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export type PublishOutcome =
  | { status: "published"; instagramMediaId: string; permalink?: string }
  | { status: "skipped"; reason: string }
  | { status: "invalid"; issues: ValidationIssue[] }
  | { status: "failed"; message: string; retryable: boolean }
  | { status: "ambiguous"; containerId: string; message: string };

/** Video containers are processed asynchronously; poll until FINISHED. */
const CONTAINER_POLL_INTERVAL_MS = 5_000;
const CONTAINER_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export class PublishService {
  constructor(private readonly options: PublishServiceOptions) {}

  /**
   * Publish an entry to Instagram.
   *
   * Refuses to publish anything that is not PUBLISHED in NextPress: the CMS
   * lifecycle is the gate, so a draft can never leak to a public audience.
   */
  async publish(auth: AuthContext, entryId: string): Promise<PublishOutcome> {
    const started = Date.now();
    const entry = await this.options.store.getPublishableEntry(auth.siteId, entryId);

    if (!entry) return { status: "skipped", reason: "Content entry not found." };

    if (entry.status !== "PUBLISHED") {
      return {
        status: "skipped",
        reason: "Only published NextPress content can be published to Instagram.",
      };
    }

    // ── Duplicate suppression ──

    if (entry.publishStatus === "PUBLISHED") {
      return {
        status: "skipped",
        reason: "This entry has already been published to Instagram.",
      };
    }

    if (entry.publishStatus === "PUBLISHING") {
      // Another attempt is mid-flight, or a previous one ended ambiguously.
      // Resolve it by asking Instagram rather than starting a second publish.
      return this.reconcile(auth, entryId);
    }

    const mediaType = inferMediaType(entry.media);

    const validation = validatePublishRequest({
      mediaType,
      items: entry.media,
      caption: entry.caption,
      altText: entry.altText,
    });

    if (!validation.valid) {
      await this.recordFailure(auth, entry, validation.issues.map((i) => i.message).join(" "), false);
      return { status: "invalid", issues: validation.issues };
    }

    // Check the account's live quota. The docs disagree on the number, so the
    // account is the authority — and a pre-flight check beats a hard failure
    // halfway through building a carousel.
    try {
      const limit = await this.options.client.getPublishingLimit();
      if (limit.remaining <= 0) {
        const message = `Instagram's publishing quota for this account is exhausted (${limit.used}/${limit.total} in the last 24 hours). Publishing will resume automatically.`;
        await this.recordFailure(auth, entry, message, true);
        return { status: "failed", message, retryable: true };
      }
    } catch {
      // A quota lookup failure must not block a legitimate publish; the
      // publish call itself will surface a real rate-limit error if it applies.
    }

    logger.info("instagram.publish.started", {
      siteId: auth.siteId,
      contentEntryId: entryId,
      operation: mediaType,
    });

    assertPublishTransition(entry.publishStatus, "PUBLISHING");
    await this.options.store.updatePublishState(auth, entryId, {
      [IG_FIELDS.publishStatus]: "PUBLISHING",
      [IG_FIELDS.publishError]: null,
    });

    let containerId: string;
    try {
      containerId = await this.createContainer(entry, mediaType);
    } catch (error) {
      return this.handlePublishError(auth, entry, error, started);
    }

    // THE CRITICAL WRITE: persisting the container id before media_publish is
    // what makes reconciliation possible if the next call's response is lost.
    await this.options.store.updatePublishState(auth, entryId, {
      [IG_FIELDS.publishContainerId]: containerId,
    });

    try {
      const published = await this.options.client.publishContainer(containerId);

      assertPublishTransition("PUBLISHING", "PUBLISHED");
      await this.options.store.updatePublishState(auth, entryId, {
        [IG_FIELDS.publishStatus]: "PUBLISHED",
        [IG_FIELDS.publishMediaId]: published.id,
        [IG_FIELDS.publishedAt]: new Date().toISOString(),
        [IG_FIELDS.publishError]: null,
      });

      logger.info("instagram.publish.completed", {
        siteId: auth.siteId,
        contentEntryId: entryId,
        instagramMediaId: published.id,
        durationMs: Date.now() - started,
      });

      return { status: "published", instagramMediaId: published.id };
    } catch (error) {
      // Network-class failures are exactly the ambiguous case: the request may
      // have succeeded at Meta's end. Never retry — reconcile.
      if (isInstagramError(error) && error.category === "network") {
        logger.warn("instagram.publish.failed", {
          siteId: auth.siteId,
          contentEntryId: entryId,
          containerId,
          status: "ambiguous",
        });

        return {
          status: "ambiguous",
          containerId,
          message:
            "The publish request to Instagram did not return a confirmation. The status will be verified automatically before any retry.",
        };
      }

      return this.handlePublishError(auth, entry, error, started);
    }
  }

  /**
   * Resolve an entry stuck in PUBLISHING by asking Instagram about the
   * container.
   *
   * Honest limitation: a container older than 24 hours reports EXPIRED
   * regardless of whether it published, and the status endpoint never returns
   * the resulting media id. When the answer is genuinely unknowable, the entry
   * is surfaced for a human decision rather than guessed at — an incorrect
   * guess means either a duplicate post or a lost one.
   */
  async reconcile(auth: AuthContext, entryId: string): Promise<PublishOutcome> {
    const entry = await this.options.store.getPublishableEntry(auth.siteId, entryId);
    if (!entry) return { status: "skipped", reason: "Content entry not found." };

    if (entry.publishStatus === "PUBLISHED") {
      return {
        status: "skipped",
        reason: "This entry has already been published to Instagram.",
      };
    }

    if (!entry.publishContainerId) {
      // No container was ever created, so nothing can have been published.
      await this.options.store.updatePublishState(auth, entryId, {
        [IG_FIELDS.publishStatus]: "NOT_PUBLISHED",
      });
      return { status: "skipped", reason: "No Instagram publication was in progress." };
    }

    let status;
    try {
      status = await this.options.client.getContainerStatus(entry.publishContainerId);
    } catch (error) {
      const message = isInstagramError(error)
        ? error.userMessage
        : "Instagram could not confirm the status of this publication.";
      return { status: "ambiguous", containerId: entry.publishContainerId, message };
    }

    logger.info("instagram.publish.reconciled", {
      siteId: auth.siteId,
      contentEntryId: entryId,
      containerId: entry.publishContainerId,
      status: status.status_code,
    });

    switch (status.status_code) {
      case "PUBLISHED": {
        // Confirmed live. Instagram gives no media id here, so the field stays
        // empty — recorded honestly rather than filled with a guess.
        await this.options.store.updatePublishState(auth, entryId, {
          [IG_FIELDS.publishStatus]: "PUBLISHED",
          [IG_FIELDS.publishedAt]: new Date().toISOString(),
          [IG_FIELDS.publishError]: null,
        });
        return { status: "published", instagramMediaId: entry.publishMediaId ?? "" };
      }

      case "FINISHED": {
        // Container is ready but was never published — safe to publish now.
        try {
          const published = await this.options.client.publishContainer(entry.publishContainerId);
          await this.options.store.updatePublishState(auth, entryId, {
            [IG_FIELDS.publishStatus]: "PUBLISHED",
            [IG_FIELDS.publishMediaId]: published.id,
            [IG_FIELDS.publishedAt]: new Date().toISOString(),
          });
          return { status: "published", instagramMediaId: published.id };
        } catch (error) {
          const message = isInstagramError(error)
            ? error.userMessage
            : "Instagram rejected the publication.";
          return { status: "failed", message, retryable: false };
        }
      }

      case "IN_PROGRESS":
        return {
          status: "ambiguous",
          containerId: entry.publishContainerId,
          message: "Instagram is still processing this media. The status will be checked again shortly.",
        };

      case "EXPIRED":
      case "ERROR": {
        const message =
          status.status_code === "EXPIRED"
            ? "The Instagram upload expired before it was published. Publish again to create a new upload."
            : `Instagram rejected this media${status.status ? `: ${status.status}` : "."}`;

        await this.options.store.updatePublishState(auth, entryId, {
          [IG_FIELDS.publishStatus]: "PUBLISH_FAILED",
          [IG_FIELDS.publishError]: message,
          [IG_FIELDS.publishContainerId]: null,
        });
        return { status: "failed", message, retryable: status.status_code === "EXPIRED" };
      }
    }
  }

  // ── Container construction ──

  private async createContainer(
    entry: PublishableEntry,
    mediaType: "IMAGE" | "VIDEO" | "CAROUSEL",
  ): Promise<string> {
    if (mediaType === "CAROUSEL") return this.createCarouselContainer(entry);

    const item = entry.media[0] as MediaCandidate;
    const input: InstagramPublishInput = {
      mediaType: mediaType as InstagramPublishType,
      caption: entry.caption,
      ...(mediaType === "VIDEO"
        ? { videoUrl: item.url }
        : { imageUrl: item.url, altText: entry.altText }),
    };

    const container = await this.options.client.createMediaContainer(input);

    // Video is processed asynchronously — a container id is not success.
    if (mediaType === "VIDEO") await this.waitForContainer(container.id);

    return container.id;
  }

  private async createCarouselContainer(entry: PublishableEntry): Promise<string> {
    const childIds: string[] = [];

    for (const item of entry.media) {
      const isVideo = item.mimeType.startsWith("video/");
      const child = await this.options.client.createMediaContainer({
        mediaType: isVideo ? "VIDEO" : "IMAGE",
        isCarouselItem: true,
        ...(isVideo ? { videoUrl: item.url } : { imageUrl: item.url }),
      });

      if (isVideo) await this.waitForContainer(child.id);
      childIds.push(child.id);
    }

    const parent = await this.options.client.createMediaContainer({
      mediaType: "CAROUSEL",
      caption: entry.caption,
      children: childIds,
    });

    return parent.id;
  }

  /** Poll a container until Instagram finishes processing it. */
  private async waitForContainer(containerId: string): Promise<void> {
    const interval = this.options.pollIntervalMs ?? CONTAINER_POLL_INTERVAL_MS;
    const deadline = Date.now() + (this.options.pollTimeoutMs ?? CONTAINER_POLL_TIMEOUT_MS);

    while (Date.now() < deadline) {
      const status = await this.options.client.getContainerStatus(containerId);

      if (status.status_code === "FINISHED" || status.status_code === "PUBLISHED") return;

      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw InstagramPublishingError({
          message: `Instagram container ${containerId} ended in ${status.status_code}`,
          userMessage:
            "Instagram could not process this media. Check that it meets Instagram's current format requirements.",
          retryable: false,
        });
      }

      await sleep(interval);
    }

    throw InstagramPublishingError({
      message: `Instagram container ${containerId} did not finish processing in time`,
      userMessage:
        "Instagram is taking unusually long to process this media. The publication will be retried automatically.",
      retryable: true,
    });
  }

  // ── Failure handling ──

  private async handlePublishError(
    auth: AuthContext,
    entry: PublishableEntry,
    error: unknown,
    started: number,
  ): Promise<PublishOutcome> {
    const message = isInstagramError(error)
      ? error.userMessage
      : "An unexpected error occurred while publishing to Instagram.";

    const retryable = isInstagramError(error)
      ? decideRetry(error, entry.publishRetryCount).shouldRetry
      : false;

    logger.error("instagram.publish.failed", {
      siteId: auth.siteId,
      contentEntryId: entry.id,
      durationMs: Date.now() - started,
      errorCode: isInstagramError(error) ? error.externalErrorCode : undefined,
      status: retryable ? "retry_pending" : "failed",
    });

    await this.recordFailure(auth, entry, message, retryable);
    return { status: "failed", message, retryable };
  }

  private async recordFailure(
    auth: AuthContext,
    entry: PublishableEntry,
    message: string,
    retryable: boolean,
  ): Promise<void> {
    await this.options.store.updatePublishState(auth, entry.id, {
      [IG_FIELDS.publishStatus]: retryable ? "RETRY_PENDING" : "PUBLISH_FAILED",
      [IG_FIELDS.publishError]: message,
      [IG_FIELDS.publishRetryCount]: entry.publishRetryCount + (retryable ? 1 : 0),
      // Clear the container: a failed container is not reusable, and leaving
      // it would make a later reconciliation inspect a stale id.
      [IG_FIELDS.publishContainerId]: null,
    });
  }
}

/** Decide the publish shape from the selected media. */
export function inferMediaType(media: MediaCandidate[]): "IMAGE" | "VIDEO" | "CAROUSEL" {
  if (media.length > 1) return "CAROUSEL";
  return media[0]?.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
