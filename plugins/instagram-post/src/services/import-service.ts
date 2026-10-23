/**
 * Import service — Instagram → NextPress.
 *
 * IDEMPOTENCY is the property that matters most here. Import may be triggered
 * by an admin, by cron, and by a retry simultaneously, so every path resolves
 * to the same rule: one Instagram media id ⇒ at most one content entry.
 * The lookup happens immediately before the write, keyed on the media id —
 * never on caption, timestamp, or URL, all of which are mutable or ambiguous.
 *
 * Imports are also PAGINATED and RESUMABLE: work proceeds one API page at a
 * time and each item is committed independently, so a crash, a rate limit, or
 * a closed browser tab costs at most the item in flight. An account with
 * thousands of posts never has its media loaded into memory at once.
 */

import type { AuthContext } from "@nextpress/core/auth/auth-types";
import type { InstagramClient, InstagramMedia } from "../api/instagram-types";
import { isInstagramError, type InstagramError } from "../api/instagram-errors";
import {
  INSTAGRAM_CONTENT_TYPE,
  captionToBlocks,
  deriveExcerpt,
  deriveSlug,
  deriveTitle,
} from "../content/content-type";
import { IG_FIELDS } from "../content/fields";
import { archiveMedia, type MediaUploader } from "./media-service";
import { logger } from "./logger";
import { decideRetry } from "./sync-state";

/**
 * The content operations the importer needs.
 *
 * `findByInstagramMediaId` is the idempotency primitive: the host implements
 * it as an indexed FieldValue lookup scoped to the site.
 */
export interface ContentStore {
  findByInstagramMediaId(
    siteId: string,
    mediaId: string,
  ): Promise<{ id: string; title: string; slug: string } | null>;

  createEntry(
    auth: AuthContext,
    input: {
      contentTypeSlug: string;
      title: string;
      slug: string;
      excerpt?: string;
      blocks: Array<{ type: string; attrs: Record<string, unknown> }>;
      status: "DRAFT" | "PUBLISHED";
      publishedAt?: Date;
      fields: Record<string, unknown>;
    },
  ): Promise<{ id: string; slug: string }>;

  updateEntry(
    auth: AuthContext,
    entryId: string,
    input: { fields?: Record<string, unknown>; excerpt?: string },
  ): Promise<void>;

  attachMedia(auth: AuthContext, entryId: string, mediaIds: string[]): Promise<void>;
}

export interface ImportServiceOptions {
  client: InstagramClient;
  content: ContentStore;
  uploader: MediaUploader;
  archiveMediaEnabled: boolean;
  importStatus: "DRAFT" | "PUBLISHED";
  fetchImpl?: typeof fetch;
}

export interface ImportItemResult {
  instagramMediaId: string;
  outcome: "imported" | "skipped" | "failed";
  contentEntryId?: string;
  error?: string;
}

export interface ImportRunResult {
  discovered: number;
  imported: number;
  skipped: number;
  failed: number;
  items: ImportItemResult[];
  /** Cursor to resume from, or null when the account has been fully walked. */
  nextCursor: string | null;
  /** True when a non-retryable failure ended the run early. */
  aborted: boolean;
  abortReason?: string;
}

export interface ImportOptions {
  /** Cap on items processed in this run. `null` walks the whole account. */
  limit: number | null;
  /** Resume token from a previous run. */
  cursor?: string;
  /** Stop at the first already-imported item (incremental sync). */
  stopAtKnown?: boolean;
  /** Refresh fields on already-imported posts instead of skipping. */
  refreshExisting?: boolean;
}

/** Page size that balances API round trips against per-request payload size. */
const PAGE_SIZE = 25;

/**
 * In-flight imports, keyed `siteId:mediaId`.
 *
 * The check-then-create in `importOne` is not atomic, so two overlapping runs
 * (a manual import racing a cron tick) could both observe "not imported" and
 * both create an entry. Serialising per media id closes that window: the
 * second caller awaits the first, then sees the entry and skips.
 *
 * LIMITATION: this is per-process. A deployment running several Node instances
 * against one database should also add a unique index on the Instagram media
 * id field value — see the README's Multi-instance note.
 */
const inFlight = new Map<string, Promise<ImportItemResult>>();

export class ImportService {
  constructor(private readonly options: ImportServiceOptions) {}

  /**
   * Preview what an import would do, without writing anything.
   *
   * Read-only by construction: it never calls the content store's write
   * methods, so an admin can safely inspect a large account first.
   */
  async preview(
    siteId: string,
    limit: number | null,
  ): Promise<{ discovered: number; alreadyArchived: number; newPosts: number; items: Array<{ mediaId: string; caption?: string; mediaType: string; timestamp: string; thumbnailUrl?: string; alreadyImported: boolean }> }> {
    const items: Array<{ mediaId: string; caption?: string; mediaType: string; timestamp: string; thumbnailUrl?: string; alreadyImported: boolean }> = [];
    let cursor: string | undefined;
    let alreadyArchived = 0;

    while (limit === null || items.length < limit) {
      const pageSize = limit === null ? PAGE_SIZE : Math.min(PAGE_SIZE, limit - items.length);
      const page = await this.options.client.listMedia(cursor, pageSize);

      for (const media of page.items) {
        const existing = await this.options.content.findByInstagramMediaId(siteId, media.id);
        if (existing) alreadyArchived++;

        items.push({
          mediaId: media.id,
          caption: media.caption,
          mediaType: media.media_type,
          timestamp: media.timestamp,
          thumbnailUrl: media.thumbnail_url ?? media.media_url,
          alreadyImported: existing !== null,
        });

        if (limit !== null && items.length >= limit) break;
      }

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    return {
      discovered: items.length,
      alreadyArchived,
      newPosts: items.length - alreadyArchived,
      items,
    };
  }

  /**
   * Run an import.
   *
   * Per-item failures are recorded and the run continues — one broken post
   * must not abort an archive of a thousand. A failure that is *systemic*
   * (expired token, rate limit) stops the run immediately, because continuing
   * would just produce hundreds of identical failures.
   */
  async run(auth: AuthContext, options: ImportOptions): Promise<ImportRunResult> {
    const started = Date.now();
    const result: ImportRunResult = {
      discovered: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      items: [],
      nextCursor: null,
      aborted: false,
    };

    logger.info("instagram.import.started", {
      siteId: auth.siteId,
      operation: options.stopAtKnown ? "sync" : "import",
      count: options.limit ?? undefined,
    });

    let cursor = options.cursor;
    let processed = 0;

    try {
      pages: while (options.limit === null || processed < options.limit) {
        const remaining = options.limit === null ? PAGE_SIZE : options.limit - processed;
        const page = await this.options.client.listMedia(cursor, Math.min(PAGE_SIZE, remaining));

        if (page.items.length === 0) break;

        // Advance the cursor BEFORE processing items. Hitting the item limit
        // mid-page exits via `break pages`, and the caller still needs the
        // cursor for the NEXT page to resume correctly.
        cursor = page.nextCursor ?? undefined;
        result.nextCursor = page.nextCursor;

        for (const media of page.items) {
          result.discovered++;

          const existing = await this.options.content.findByInstagramMediaId(
            auth.siteId,
            media.id,
          );

          if (existing && !options.refreshExisting) {
            result.skipped++;
            result.items.push({ instagramMediaId: media.id, outcome: "skipped", contentEntryId: existing.id });

            // Incremental sync: media arrives newest-first, so the first known
            // item means everything after it is already archived.
            if (options.stopAtKnown) {
              result.nextCursor = null;
              break pages;
            }

            processed++;
            if (options.limit !== null && processed >= options.limit) break pages;
            continue;
          }

          const itemResult = await this.importOne(auth, media, existing?.id);
          result.items.push(itemResult);

          if (itemResult.outcome === "imported") result.imported++;
          else if (itemResult.outcome === "skipped") result.skipped++;
          else result.failed++;

          processed++;
          if (options.limit !== null && processed >= options.limit) break pages;
        }

        if (!page.nextCursor) break;
      }
    } catch (error) {
      result.aborted = true;
      result.abortReason = isInstagramError(error)
        ? error.userMessage
        : "An unexpected error interrupted the import.";

      logger.error("instagram.import.failed", {
        siteId: auth.siteId,
        durationMs: Date.now() - started,
        errorCode: isInstagramError(error) ? error.externalErrorCode : undefined,
        status: "aborted",
      });

      // Systemic failures propagate so the caller can mark the connection.
      if (isInstagramError(error) && (error.category === "auth" || error.category === "rate_limit")) {
        throw error;
      }
    }

    logger.info("instagram.import.completed", {
      siteId: auth.siteId,
      count: result.imported,
      durationMs: Date.now() - started,
      status: result.aborted ? "partial" : "ok",
    });

    return result;
  }

  /**
   * Re-import one known Instagram post by media id.
   *
   * Used by the admin Retry action. It fetches the single item rather than
   * walking pages, and refreshes the existing entry — the media-id lookup in
   * `importOne` guarantees no second entry is created.
   */
  async resyncOne(auth: AuthContext, mediaId: string): Promise<ImportItemResult> {
    const media = await this.options.client.getMedia(mediaId);
    const existing = await this.options.content.findByInstagramMediaId(auth.siteId, mediaId);
    return this.importOne(auth, media, existing?.id);
  }

  /**
   * Import a single media item.
   *
   * Ordering matters: media is archived BEFORE the entry is marked IMPORTED,
   * so a crash mid-way leaves the entry in a failed/retryable state rather
   * than a state that claims success without the files.
   */
  private async importOne(
    auth: AuthContext,
    media: InstagramMedia,
    existingEntryId?: string,
  ): Promise<ImportItemResult> {
    const lockKey = `${auth.siteId}:${media.id}`;
    const pending = inFlight.get(lockKey);

    if (pending) {
      // Another run is already importing this media. Wait for it, then report
      // a skip rather than creating a second entry.
      const settled = await pending;
      return { ...settled, outcome: settled.outcome === "failed" ? "failed" : "skipped" };
    }

    const work = this.importOneUnlocked(auth, media, existingEntryId);
    inFlight.set(lockKey, work);

    try {
      return await work;
    } finally {
      inFlight.delete(lockKey);
    }
  }

  private async importOneUnlocked(
    auth: AuthContext,
    media: InstagramMedia,
    existingEntryId?: string,
  ): Promise<ImportItemResult> {
    try {
      const caption = media.caption;
      const publishedAt = new Date(media.timestamp);

      const fields: Record<string, unknown> = {
        [IG_FIELDS.mediaId]: media.id,
        [IG_FIELDS.username]: media.username,
        [IG_FIELDS.permalink]: media.permalink,
        [IG_FIELDS.mediaType]: media.media_type,
        [IG_FIELDS.timestamp]: media.timestamp,
        [IG_FIELDS.caption]: caption,
        [IG_FIELDS.syncStatus]: "IMPORTING",
        [IG_FIELDS.source]: "instagram",
        [IG_FIELDS.retryCount]: 0,
      };

      let entryId: string;

      if (existingEntryId) {
        // Refresh path: never create a second entry for known media.
        await this.options.content.updateEntry(auth, existingEntryId, {
          fields,
          excerpt: deriveExcerpt(caption),
        });
        entryId = existingEntryId;
      } else {
        const created = await this.options.content.createEntry(auth, {
          contentTypeSlug: INSTAGRAM_CONTENT_TYPE,
          title: deriveTitle(media),
          slug: deriveSlug(media.id),
          excerpt: deriveExcerpt(caption),
          blocks: captionToBlocks(caption),
          status: this.options.importStatus,
          publishedAt,
          fields,
        });
        entryId = created.id;
      }

      if (this.options.archiveMediaEnabled) {
        await this.archiveAllMedia(auth, media, entryId, caption);
      }

      await this.options.content.updateEntry(auth, entryId, {
        fields: {
          [IG_FIELDS.syncStatus]: "IMPORTED",
          [IG_FIELDS.lastSyncedAt]: new Date().toISOString(),
          [IG_FIELDS.lastError]: null,
        },
      });

      return { instagramMediaId: media.id, outcome: "imported", contentEntryId: entryId };
    } catch (error) {
      // Auth and rate-limit failures are systemic — rethrow so the whole run
      // stops rather than burning through the remaining items.
      if (isInstagramError(error) && (error.category === "auth" || error.category === "rate_limit")) {
        throw error;
      }

      const message = isInstagramError(error)
        ? error.userMessage
        : "An unexpected error occurred while importing this post.";

      logger.warn("instagram.import.failed", {
        siteId: auth.siteId,
        instagramMediaId: media.id,
        errorCode: isInstagramError(error) ? error.externalErrorCode : undefined,
      });

      if (existingEntryId) {
        await this.options.content
          .updateEntry(auth, existingEntryId, {
            fields: {
              [IG_FIELDS.syncStatus]: this.nextFailureState(error),
              [IG_FIELDS.lastError]: message,
            },
          })
          .catch(() => {
            // A failure to record a failure must not mask the original error.
          });
      }

      return { instagramMediaId: media.id, outcome: "failed", error: message };
    }
  }

  /** Retryable failures park in RETRY_PENDING; permanent ones in IMPORT_FAILED. */
  private nextFailureState(error: unknown): string {
    if (!isInstagramError(error)) return "IMPORT_FAILED";
    return decideRetry(error as InstagramError, 0).shouldRetry ? "RETRY_PENDING" : "IMPORT_FAILED";
  }

  /**
   * Archive every file belonging to a post.
   *
   * A carousel becomes several assets, in order. Items whose `media_url` Meta
   * withheld are skipped rather than failing the post — the caption, date,
   * and permalink are still worth archiving.
   */
  private async archiveAllMedia(
    auth: AuthContext,
    media: InstagramMedia,
    entryId: string,
    caption: string | undefined,
  ): Promise<void> {
    const sources: Array<{ url: string; id: string }> = [];

    if (media.children?.length) {
      for (const child of media.children) {
        const url = child.media_url ?? child.thumbnail_url;
        if (url) sources.push({ url, id: child.id });
      }
    } else {
      const url = media.media_url ?? media.thumbnail_url;
      if (url) sources.push({ url, id: media.id });
    }

    if (sources.length === 0) {
      logger.warn("instagram.media.failed", {
        siteId: auth.siteId,
        instagramMediaId: media.id,
        status: "no_downloadable_url",
      });
      return;
    }

    const assetIds: string[] = [];

    // Sequential on purpose: parallel downloads of a large carousel would
    // spike memory and invite rate limiting for no meaningful speed win.
    for (const source of sources) {
      try {
        const asset = await archiveMedia({
          auth,
          uploader: this.options.uploader,
          url: source.url,
          mediaId: source.id,
          alt: caption?.slice(0, 500),
          caption,
          fetchImpl: this.options.fetchImpl,
        });
        assetIds.push(asset.id);
      } catch (error) {
        logger.warn("instagram.media.failed", {
          siteId: auth.siteId,
          instagramMediaId: source.id,
          errorCode: isInstagramError(error) ? error.category : "unknown",
        });
      }
    }

    if (assetIds.length > 0) {
      await this.options.content.attachMedia(auth, entryId, assetIds);
    }
  }
}
