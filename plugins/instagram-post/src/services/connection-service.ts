/**
 * Connection and token lifecycle.
 *
 * State lives in the NextPress settings store under `plugin:instagram-post`,
 * which is keyed on siteId — so multi-tenant isolation is structural rather
 * than something this code has to remember to enforce.
 *
 * TOKEN RULES
 *   - The token is read only by server-side services.
 *   - It is never returned from a function that feeds an HTTP response;
 *     callers get `PublicConnection` via `toPublicConnection()`.
 *   - It is never logged: the logger scrubs it, and nothing here logs it.
 */

import type { AuthContext } from "@nextpress/core/auth/auth-types";
import { refreshLongLivedToken } from "../api/instagram-auth";
import { isInstagramError } from "../api/instagram-errors";
import {
  SECRET_KEY_PREFIX,
  SETTINGS_GROUP,
  parseConnection,
  parseSettings,
  toPublicConnection,
  type InstagramConnection,
  type InstagramSettings,
  type PublicConnection,
} from "../schemas/settings";
import { logger } from "./logger";

const TOKEN_KEY = `${SECRET_KEY_PREFIX}accessToken` as const;

/**
 * Minimal settings-store surface. Narrowing it to these three calls keeps the
 * service unit-testable without a database and documents exactly how much
 * authority the plugin needs.
 */
export interface SettingsStore {
  getGroup(siteId: string, group: string): Promise<Record<string, unknown>>;
  updateGroup(auth: AuthContext, input: { group: string; values: Record<string, unknown> }): Promise<unknown>;
  set(siteId: string, group: string, key: string, value: unknown): Promise<void>;
  delete(siteId: string, group: string, key: string): Promise<void>;
}

const CONNECTION_KEY = "connection";

export interface ConnectionServiceOptions {
  store: SettingsStore;
  fetchImpl?: typeof fetch;
}

/**
 * Refresh this far before expiry. Meta requires the token to be at least 24
 * hours old and kills it permanently at 60 days, so day ~45 is comfortably
 * inside both bounds even if several cron runs are missed.
 */
const REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export class ConnectionService {
  private readonly store: SettingsStore;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConnectionServiceOptions) {
    this.store = options.store;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  /** Full connection INCLUDING the token. Server-side callers only. */
  async getConnection(siteId: string): Promise<InstagramConnection> {
    const group = await this.store.getGroup(siteId, SETTINGS_GROUP);
    return parseConnection(group[CONNECTION_KEY]);
  }

  /** Client-safe view. This is what every HTTP response must use. */
  async getPublicConnection(siteId: string): Promise<PublicConnection> {
    return toPublicConnection(await this.getConnection(siteId));
  }

  async getSettings(siteId: string): Promise<InstagramSettings> {
    const group = await this.store.getGroup(siteId, SETTINGS_GROUP);
    return parseSettings(group.settings);
  }

  async updateSettings(auth: AuthContext, values: Partial<InstagramSettings>): Promise<InstagramSettings> {
    const current = await this.getSettings(auth.siteId);
    const next = parseSettings({ ...current, ...values });
    await this.store.updateGroup(auth, { group: SETTINGS_GROUP, values: { settings: next } });
    return next;
  }

  /**
   * Persist a completed OAuth connection.
   *
   * Reconnecting the SAME account preserves `connectedAt` and every existing
   * post mapping — mappings live on content entries keyed by Instagram media
   * id, so they are untouched here and re-import cannot duplicate them.
   */
  async saveConnection(
    auth: AuthContext,
    input: {
      accountId: string;
      username: string;
      accountType?: string;
      accessToken: string;
      tokenExpiresAt: Date;
    },
  ): Promise<PublicConnection> {
    const existing = await this.getConnection(auth.siteId);

    // Compare against the retained identity too, so reconnecting after a
    // disconnect is recognised as the same account rather than a new one.
    const knownAccountId = existing.accountId ?? existing.previousAccountId;
    const sameAccount = knownAccountId === input.accountId;
    const priorConnectedAt = existing.connectedAt ?? existing.previousConnectedAt;

    const connection: InstagramConnection = {
      status: "connected",
      accountId: input.accountId,
      username: input.username,
      accountType: input.accountType,
      connectedAt: sameAccount && priorConnectedAt ? priorConnectedAt : new Date().toISOString(),
      lastSyncAt: sameAccount ? existing.lastSyncAt : undefined,
      lastSyncError: undefined,
      tokenExpiresAt: input.tokenExpiresAt.toISOString(),
      [TOKEN_KEY]: input.accessToken,
    };

    await this.store.updateGroup(auth, {
      group: SETTINGS_GROUP,
      values: { [CONNECTION_KEY]: connection },
    });

    logger.info("instagram.connection.created", {
      siteId: auth.siteId,
      operation: sameAccount ? "reconnect" : "connect",
      status: "connected",
    });

    return toPublicConnection(connection);
  }

  /**
   * Disconnect.
   *
   * The token is destroyed; archived content is NOT. The archive belongs to
   * the website, and silently deleting an account's history because someone
   * revoked an API connection would be indefensible.
   */
  async disconnect(auth: AuthContext): Promise<void> {
    const existing = await this.getConnection(auth.siteId);

    await this.store.updateGroup(auth, {
      group: SETTINGS_GROUP,
      values: {
        [CONNECTION_KEY]: {
          status: "not_connected",
          // Retain identity (never the token) so a later reconnect of the same
          // account preserves its original connection date and mappings.
          previousAccountId: existing.accountId ?? existing.previousAccountId,
          previousConnectedAt: existing.connectedAt ?? existing.previousConnectedAt,
        } satisfies InstagramConnection,
      },
    });

    logger.info("instagram.connection.disconnected", { siteId: auth.siteId });
  }

  /** Flag the connection as needing re-authorisation, without losing account details. */
  async markNeedsReauth(auth: AuthContext, reason: string): Promise<void> {
    const connection = await this.getConnection(auth.siteId);

    await this.store.updateGroup(auth, {
      group: SETTINGS_GROUP,
      values: {
        [CONNECTION_KEY]: {
          ...connection,
          status: "needs_reauth",
          lastSyncError: reason,
          // Drop the dead credential rather than keeping it around.
          [TOKEN_KEY]: undefined,
        } satisfies InstagramConnection,
      },
    });

    logger.warn("instagram.token.expired", { siteId: auth.siteId, status: "needs_reauth" });
  }

  async recordSyncResult(
    auth: AuthContext,
    result: { at: Date; error?: string },
  ): Promise<void> {
    const connection = await this.getConnection(auth.siteId);
    await this.store.updateGroup(auth, {
      group: SETTINGS_GROUP,
      values: {
        [CONNECTION_KEY]: {
          ...connection,
          lastSyncAt: result.at.toISOString(),
          lastSyncError: result.error,
        } satisfies InstagramConnection,
      },
    });
  }

  /**
   * Return a usable access token, refreshing it when it nears expiry.
   *
   * Returns null when the site has no working connection. Callers treat null
   * as "skip this site", which is what keeps a single broken tenant from
   * failing an entire multi-site cron run.
   */
  async getUsableToken(
    auth: AuthContext,
  ): Promise<{ accessToken: string; accountId: string } | null> {
    const connection = await this.getConnection(auth.siteId);
    const token = connection[TOKEN_KEY];

    if (connection.status !== "connected" || !token || !connection.accountId) return null;

    const expiresAt = connection.tokenExpiresAt
      ? new Date(connection.tokenExpiresAt).getTime()
      : null;

    if (expiresAt !== null && expiresAt <= Date.now()) {
      // Past expiry there is nothing to refresh — Meta requires a live token.
      await this.markNeedsReauth(auth, "The Instagram access token has expired.");
      return null;
    }

    const needsRefresh = expiresAt !== null && expiresAt - Date.now() < REFRESH_THRESHOLD_MS;
    if (!needsRefresh) return { accessToken: token, accountId: connection.accountId };

    try {
      const refreshed = await refreshLongLivedToken(token, this.fetchImpl);

      await this.store.updateGroup(auth, {
        group: SETTINGS_GROUP,
        values: {
          [CONNECTION_KEY]: {
            ...connection,
            tokenExpiresAt: refreshed.expiresAt.toISOString(),
            [TOKEN_KEY]: refreshed.accessToken,
          } satisfies InstagramConnection,
        },
      });

      logger.info("instagram.token.refreshed", { siteId: auth.siteId });
      return { accessToken: refreshed.accessToken, accountId: connection.accountId };
    } catch (error) {
      // A refresh failure is not automatically fatal: the current token may
      // still have weeks of life. Only a genuine auth rejection forces re-auth.
      if (isInstagramError(error) && error.category === "auth") {
        await this.markNeedsReauth(auth, error.userMessage);
        return null;
      }

      logger.warn("instagram.connection.failed", {
        siteId: auth.siteId,
        operation: "token_refresh",
        status: "deferred",
      });
      return { accessToken: token, accountId: connection.accountId };
    }
  }
}
