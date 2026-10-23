/**
 * Plugin settings, connection state, and the secret boundary.
 *
 * Storage: the NextPress settings service, group `plugin:instagram-post`.
 * That store is keyed on (siteId, group, key), so every value here is
 * site-scoped by construction — Site A cannot read Site B's connection.
 *
 * THE SECRET RULE
 * ---------------
 * Any key prefixed `_secret_` is confidential. `toPublicConnection()` is the
 * single boundary every HTTP response and UI payload must pass through. The
 * prefix convention (rather than an explicit denylist) means a future secret
 * field is redacted by default — the safe direction to fail.
 */

import { z } from "zod";

export const SETTINGS_GROUP = "plugin:instagram-post";

/** Keys with this prefix are never serialised to a client. */
export const SECRET_KEY_PREFIX = "_secret_";

// ── Sync intervals ──
//
// The floor is 15 minutes on purpose. Instagram publishes no "new media"
// webhook, so polling is the only option — and polling harder than this burns
// the account's rate-limit budget for no practical gain.

export const syncIntervalSchema = z.enum([
  "manual",
  "15m",
  "30m",
  "1h",
  "6h",
  "12h",
  "24h",
]);

export type SyncInterval = z.infer<typeof syncIntervalSchema>;

export const SYNC_INTERVAL_MS: Record<Exclude<SyncInterval, "manual">, number> = {
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

// ── Settings ──

export const instagramSettingsSchema = z.object({
  /** Automatic import of newly discovered Instagram media. */
  autoSync: z.boolean().default(false),
  syncInterval: syncIntervalSchema.default("6h"),

  /**
   * Status applied to imported entries. Defaults to DRAFT so an import can
   * never silently publish an account's entire back catalogue to a live site.
   */
  importStatus: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),

  /** Download Instagram media into the Media Library (the point of archiving). */
  archiveMedia: z.boolean().default(true),

  /** Pre-tick "Publish to Instagram" on new content. Off by default. */
  publishByDefault: z.boolean().default(false),

  /** Seed the Instagram caption from the entry excerpt when none is set. */
  captionFromExcerpt: z.boolean().default(true),
});

export type InstagramSettings = z.infer<typeof instagramSettingsSchema>;

export function parseSettings(raw: unknown): InstagramSettings {
  const result = instagramSettingsSchema.safeParse(raw ?? {});
  // Malformed stored settings must not brick the admin screen; fall back to
  // schema defaults, which are the conservative values.
  return result.success ? result.data : instagramSettingsSchema.parse({});
}

// ── Connection state ──

export const connectionStatusSchema = z.enum([
  "not_connected",
  "connected",
  "needs_reauth",
]);

export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const instagramConnectionSchema = z.object({
  status: connectionStatusSchema,
  accountId: z.string().optional(),
  username: z.string().optional(),
  accountType: z.string().optional(),
  connectedAt: z.string().optional(),
  lastSyncAt: z.string().optional(),
  lastSyncError: z.string().optional(),
  tokenExpiresAt: z.string().optional(),

  /**
   * Account identity retained across a disconnect.
   *
   * Reconnecting the SAME account must not look like a brand-new connection —
   * the original connection date is kept, and the archive's existing mappings
   * stay intact. Non-secret: it is the site's own account id.
   */
  previousAccountId: z.string().optional(),
  previousConnectedAt: z.string().optional(),

  /** SECRET — long-lived access token. Never leaves the server. */
  [`${SECRET_KEY_PREFIX}accessToken`]: z.string().optional(),
});

export type InstagramConnection = z.infer<typeof instagramConnectionSchema>;

/** Client-safe projection of the connection. Contains no secret material. */
export interface PublicConnection {
  status: ConnectionStatus;
  accountId?: string;
  username?: string;
  accountType?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  lastSyncError?: string;
  /** Derived state — never the token itself. */
  tokenStatus: "valid" | "expiring_soon" | "expired" | "unknown";
  tokenExpiresAt?: string;
}

/** Warn this far ahead of expiry so an admin can reconnect before sync breaks. */
const TOKEN_EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

export function deriveTokenStatus(
  expiresAt: string | undefined,
  now: Date = new Date(),
): PublicConnection["tokenStatus"] {
  if (!expiresAt) return "unknown";
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return "unknown";
  if (expiry <= now.getTime()) return "expired";
  if (expiry - now.getTime() <= TOKEN_EXPIRY_WARNING_MS) return "expiring_soon";
  return "valid";
}

/**
 * THE SECRET BOUNDARY.
 *
 * Every API response and server-component prop describing the connection must
 * be produced by this function. It reads only known-safe fields, so adding a
 * secret to the connection cannot accidentally widen the public surface.
 */
export function toPublicConnection(
  connection: InstagramConnection,
  now: Date = new Date(),
): PublicConnection {
  const tokenStatus = deriveTokenStatus(connection.tokenExpiresAt, now);

  return {
    // An expired token means sync is broken; surface it as needing attention
    // even if the stored status still claims "connected".
    status:
      connection.status === "connected" && tokenStatus === "expired"
        ? "needs_reauth"
        : connection.status,
    accountId: connection.accountId,
    username: connection.username,
    accountType: connection.accountType,
    connectedAt: connection.connectedAt,
    lastSyncAt: connection.lastSyncAt,
    lastSyncError: connection.lastSyncError,
    tokenStatus,
    tokenExpiresAt: connection.tokenExpiresAt,
  };
}

/**
 * Defence in depth: strip every `_secret_*` key from an arbitrary object.
 *
 * `toPublicConnection` is the primary boundary; this catches raw settings maps
 * that flow through generic settings endpoints.
 */
export function redactSecrets<T extends Record<string, unknown>>(values: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith(SECRET_KEY_PREFIX)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

export function parseConnection(raw: unknown): InstagramConnection {
  const result = instagramConnectionSchema.safeParse(raw ?? {});
  return result.success ? result.data : { status: "not_connected" };
}

/** Settings-group definition powering the admin settings UI. */
export const INSTAGRAM_SETTINGS_GROUP = {
  slug: SETTINGS_GROUP,
  name: "Instagram",
  description: "Synchronisation, import and publishing behaviour for the connected account.",
  source: "instagram-post",
  fields: [
    {
      key: "autoSync",
      label: "Automatic synchronisation",
      description: "Import new Instagram posts automatically on a schedule.",
      type: "boolean" as const,
      defaultValue: false,
    },
    {
      key: "syncInterval",
      label: "Sync frequency",
      description: "How often to check Instagram for new posts.",
      type: "select" as const,
      defaultValue: "6h",
      options: [
        { label: "Manual only", value: "manual" },
        { label: "Every 15 minutes", value: "15m" },
        { label: "Every 30 minutes", value: "30m" },
        { label: "Hourly", value: "1h" },
        { label: "Every 6 hours", value: "6h" },
        { label: "Every 12 hours", value: "12h" },
        { label: "Daily", value: "24h" },
      ],
    },
    {
      key: "importStatus",
      label: "Imported post status",
      description: "Status applied to newly imported Instagram posts.",
      type: "select" as const,
      defaultValue: "DRAFT",
      options: [
        { label: "Draft — review before publishing", value: "DRAFT" },
        { label: "Published immediately", value: "PUBLISHED" },
      ],
    },
    {
      key: "archiveMedia",
      label: "Archive media locally",
      description:
        "Download Instagram images and videos into the Media Library. Instagram URLs expire, so this is required for a durable archive.",
      type: "boolean" as const,
      defaultValue: true,
    },
    {
      key: "publishByDefault",
      label: "Publish to Instagram by default",
      description: "Pre-enable Instagram publishing on newly created content.",
      type: "boolean" as const,
      defaultValue: false,
    },
    {
      key: "captionFromExcerpt",
      label: "Derive caption from excerpt",
      description: "Use the entry excerpt as the Instagram caption when none is provided.",
      type: "boolean" as const,
      defaultValue: true,
    },
  ],
};
