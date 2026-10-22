/**
 * Sync service — scheduled discovery of new Instagram posts.
 *
 * Instagram publishes NO webhook for "the account posted new media" (verified
 * against the current webhook field list: comments, mentions, messages,
 * story_insights, …). Polling is therefore the only correct design, not a
 * shortcut — and because it is polling, it must be frugal:
 *
 *   - Runs only when the configured interval has genuinely elapsed.
 *   - Stops at the first already-imported post, so a routine run costs one
 *     API call regardless of how large the archive is.
 *   - Backs off on rate limits instead of hammering the endpoint.
 *
 * The public website never calls Instagram. This service writes to the local
 * database; visitors read from it.
 */

import type { AuthContext } from "@nextpress/core/auth/auth-types";
import { isInstagramError } from "../api/instagram-errors";
import { SYNC_INTERVAL_MS, type InstagramSettings } from "../schemas/settings";
import type { ConnectionService } from "./connection-service";
import type { ImportRunResult, ImportService } from "./import-service";
import { logger } from "./logger";

export interface SyncResult {
  ran: boolean;
  reason?: string;
  imported: number;
  skipped: number;
  failed: number;
}

/**
 * Cap on items examined per scheduled run.
 *
 * A routine run stops at the first known post long before this. The cap exists
 * so that a first sync after a long outage cannot turn into an unbounded walk
 * of an entire account inside a cron window.
 */
const MAX_ITEMS_PER_SYNC = 50;

export function isSyncDue(
  settings: InstagramSettings,
  lastSyncAt: string | undefined,
  now: Date = new Date(),
): { due: boolean; reason?: string } {
  if (!settings.autoSync) return { due: false, reason: "Automatic synchronisation is disabled." };
  if (settings.syncInterval === "manual") {
    return { due: false, reason: "Synchronisation is set to manual only." };
  }

  if (!lastSyncAt) return { due: true };

  const last = new Date(lastSyncAt).getTime();
  if (Number.isNaN(last)) return { due: true };

  const elapsed = now.getTime() - last;
  const interval = SYNC_INTERVAL_MS[settings.syncInterval];

  return elapsed >= interval
    ? { due: true }
    : {
        due: false,
        reason: `Next sync in ${Math.ceil((interval - elapsed) / 60_000)} minute(s).`,
      };
}

export interface SyncServiceOptions {
  connections: ConnectionService;
  /** Built per site, because each site has its own token. */
  createImportService: (
    auth: AuthContext,
    token: { accessToken: string; accountId: string },
    settings: InstagramSettings,
  ) => ImportService;
  /** Invalidate caches for archive pages and blocks after new content lands. */
  revalidate?: (siteId: string) => Promise<void> | void;
}

export class SyncService {
  constructor(private readonly options: SyncServiceOptions) {}

  /**
   * Run synchronisation for one site.
   *
   * `force` bypasses the interval check for a manual "Sync Now", but never
   * bypasses the connection or token checks.
   */
  async syncSite(auth: AuthContext, force = false): Promise<SyncResult> {
    const started = Date.now();
    const connection = await this.options.connections.getConnection(auth.siteId);

    if (connection.status !== "connected") {
      return {
        ran: false,
        reason:
          connection.status === "needs_reauth"
            ? "The Instagram connection requires attention. Reconnect the account."
            : "No Instagram account is connected.",
        imported: 0,
        skipped: 0,
        failed: 0,
      };
    }

    const settings = await this.options.connections.getSettings(auth.siteId);

    if (!force) {
      const due = isSyncDue(settings, connection.lastSyncAt);
      if (!due.due) {
        return { ran: false, reason: due.reason, imported: 0, skipped: 0, failed: 0 };
      }
    }

    const token = await this.options.connections.getUsableToken(auth);
    if (!token) {
      return {
        ran: false,
        reason: "The Instagram connection requires attention. Reconnect the account.",
        imported: 0,
        skipped: 0,
        failed: 0,
      };
    }

    logger.info("instagram.sync.started", {
      siteId: auth.siteId,
      operation: force ? "manual" : "scheduled",
    });

    let result: ImportRunResult;
    try {
      const importer = this.options.createImportService(auth, token, settings);
      result = await importer.run(auth, {
        limit: MAX_ITEMS_PER_SYNC,
        // The whole reason a routine sync is cheap: newest-first ordering
        // means the first known post proves everything older is archived.
        stopAtKnown: true,
      });
    } catch (error) {
      const message = isInstagramError(error)
        ? error.userMessage
        : "An unexpected error interrupted synchronisation.";

      if (isInstagramError(error) && error.category === "auth") {
        await this.options.connections.markNeedsReauth(auth, message);
      }

      if (isInstagramError(error) && error.category === "rate_limit") {
        logger.warn("instagram.rate_limit", {
          siteId: auth.siteId,
          operation: "sync",
          durationMs: error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : undefined,
        });
      }

      // Recording the failure is what makes the interval act as a backoff:
      // the next run is not due until the configured window has passed again.
      await this.options.connections.recordSyncResult(auth, { at: new Date(), error: message });

      logger.error("instagram.sync.failed", {
        siteId: auth.siteId,
        durationMs: Date.now() - started,
        errorCode: isInstagramError(error) ? error.externalErrorCode : undefined,
      });

      return { ran: true, reason: message, imported: 0, skipped: 0, failed: 0 };
    }

    await this.options.connections.recordSyncResult(auth, {
      at: new Date(),
      error: result.aborted ? result.abortReason : undefined,
    });

    // Only bust caches when something actually changed.
    if (result.imported > 0 && this.options.revalidate) {
      await this.options.revalidate(auth.siteId);
    }

    logger.info("instagram.sync.completed", {
      siteId: auth.siteId,
      count: result.imported,
      durationMs: Date.now() - started,
      status: result.aborted ? "partial" : "ok",
    });

    return {
      ran: true,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
    };
  }
}
