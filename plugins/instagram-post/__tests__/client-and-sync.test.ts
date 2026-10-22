import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@nextpress/core/auth/auth-types";
import { InstagramApiClient } from "../src/api/instagram-client";
import { expiredTokenError, generatePosts, imagePost, rateLimitError } from "../src/api/fixtures";
import { instagramMediaSchema, instagramPublishingLimitSchema } from "../src/api/instagram-types";
import { ConnectionService, type SettingsStore } from "../src/services/connection-service";
import { isSyncDue } from "../src/services/sync-service";
import { SETTINGS_GROUP, parseSettings, type InstagramSettings } from "../src/schemas/settings";

const auth = { siteId: "site-a", user: { id: "u1" }, role: "administrator", permissions: {} } as unknown as AuthContext;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function client(fetchImpl: typeof fetch) {
  return new InstagramApiClient({
    accessToken: "IGQVJXtesttoken1234567890abcdef",
    accountId: "17841400000000000",
    fetchImpl,
  });
}

describe("InstagramApiClient transport", () => {
  it("sends the token in the query string for GET", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "1", username: "u" }));
    await client(fetchImpl as unknown as typeof fetch).getAccount();

    const url = (fetchImpl.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain("access_token=");
    expect(url).toContain("graph.instagram.com");
  });

  it("sends the token in the BODY for POST, keeping it out of access logs", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "container-1" }));
    await client(fetchImpl as unknown as typeof fetch).createMediaContainer({
      mediaType: "IMAGE",
      imageUrl: "https://example.com/a.jpg",
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("access_token");
    expect(String(init.body)).toContain("access_token=");
  });

  it("omits media_type for IMAGE, which Meta rejects when sent", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "container-1" }));
    await client(fetchImpl as unknown as typeof fetch).createMediaContainer({
      mediaType: "IMAGE",
      imageUrl: "https://example.com/a.jpg",
    });

    expect(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).not.toContain(
      "media_type",
    );
  });

  it("classifies an expired token from the error envelope", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(expiredTokenError, { status: 400 }));
    await expect(client(fetchImpl as unknown as typeof fetch).getAccount()).rejects.toMatchObject({
      category: "auth",
      retryable: false,
    });
  });

  it("classifies a rate limit as retryable", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(rateLimitError, { status: 400 }));
    await expect(client(fetchImpl as unknown as typeof fetch).getAccount()).rejects.toMatchObject({
      category: "rate_limit",
      retryable: true,
    });
  });

  it("mines the business-use-case header for a wait hint", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(rateLimitError), {
        status: 400,
        headers: {
          "content-type": "application/json",
          "x-business-use-case-usage": JSON.stringify({
            "123": [{ estimated_time_to_regain_access: 12 }],
          }),
        },
      }),
    );

    await expect(client(fetchImpl as unknown as typeof fetch).getAccount()).rejects.toMatchObject({
      retryAfterSeconds: 720,
    });
  });

  it("rejects a malformed response instead of passing it through", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: true }));
    await expect(client(fetchImpl as unknown as typeof fetch).getAccount()).rejects.toMatchObject({
      category: "validation",
    });
  });

  it("treats a non-JSON body as an error", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>502</html>", { status: 502 }));
    await expect(client(fetchImpl as unknown as typeof fetch).getAccount()).rejects.toBeDefined();
  });

  it("stops paginating when paging.next is absent", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [imagePost], paging: { cursors: { after: "CURSOR" } } }),
    );

    // A cursor without `next` is the final page; treating it as more would loop.
    const page = await client(fetchImpl as unknown as typeof fetch).listMedia();
    expect(page.nextCursor).toBeNull();
  });

  it("returns a cursor when more pages exist", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: generatePosts(2),
        paging: { cursors: { after: "CURSOR" }, next: "https://graph.instagram.com/next" },
      }),
    );
    expect((await client(fetchImpl as unknown as typeof fetch).listMedia()).nextCursor).toBe("CURSOR");
  });

  it("surfaces a timeout as a retryable network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    await expect(client(fetchImpl as unknown as typeof fetch).getAccount()).rejects.toMatchObject({
      category: "network",
      retryable: true,
    });
  });

  it("falls back to the documented floor when quota config is missing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{}] }));
    const limit = await client(fetchImpl as unknown as typeof fetch).getPublishingLimit();
    // Assuming unlimited headroom is what causes a hard wall mid-run.
    expect(limit.total).toBe(50);
  });
});

describe("response schemas", () => {
  it("accepts media without media_url", () => {
    expect(
      instagramMediaSchema.safeParse({
        id: "1",
        media_type: "VIDEO",
        timestamp: "2026-01-01T00:00:00+0000",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown media type", () => {
    expect(
      instagramMediaSchema.safeParse({ id: "1", media_type: "HOLOGRAM", timestamp: "x" }).success,
    ).toBe(false);
  });

  it("flattens carousel children", () => {
    const parsed = instagramMediaSchema.parse({
      id: "1",
      media_type: "CAROUSEL_ALBUM",
      timestamp: "2026-01-01T00:00:00+0000",
      children: { data: [{ id: "c1", media_type: "IMAGE" }] },
    });
    expect(parsed.children).toHaveLength(1);
  });

  it("defaults an empty publishing-limit payload", () => {
    expect(instagramPublishingLimitSchema.parse({}).data).toEqual([]);
  });
});

// ── Connection service ──

function createStore(initial: Record<string, unknown> = {}) {
  const groups = new Map<string, Record<string, unknown>>();
  groups.set(`site-a:${SETTINGS_GROUP}`, { ...initial });

  const store: SettingsStore = {
    async getGroup(siteId, group) {
      return groups.get(`${siteId}:${group}`) ?? {};
    },
    async updateGroup(a, input) {
      const key = `${a.siteId}:${input.group}`;
      groups.set(key, { ...(groups.get(key) ?? {}), ...input.values });
      return undefined;
    },
    async set(siteId, group, key, value) {
      const gk = `${siteId}:${group}`;
      groups.set(gk, { ...(groups.get(gk) ?? {}), [key]: value });
    },
    async delete() {},
  };

  return { store, groups };
}

describe("ConnectionService", () => {
  it("stores a connection and returns a token-free public view", async () => {
    const { store } = createStore();
    const service = new ConnectionService({ store });

    const publicView = await service.saveConnection(auth, {
      accountId: "17841400000000000",
      username: "example_account",
      accessToken: "IGQVJXsecret1234567890abcdefgh",
      tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000),
    });

    expect(JSON.stringify(publicView)).not.toContain("IGQVJXsecret");
    expect(publicView.username).toBe("example_account");
  });

  it("preserves connectedAt when reconnecting the SAME account", async () => {
    const { store } = createStore();
    const service = new ConnectionService({ store });

    const first = await service.saveConnection(auth, {
      accountId: "acct-1",
      username: "u",
      accessToken: "t1",
      tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000),
    });

    await service.disconnect(auth);

    const second = await service.saveConnection(auth, {
      accountId: "acct-1",
      username: "u",
      accessToken: "t2",
      tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000),
    });

    // Reconnecting must not look like a brand-new connection.
    expect(second.connectedAt).toBe(first.connectedAt);
  });

  it("retains account identity across a disconnect, but never the token", async () => {
    // Regression: disconnect used to wipe the account id, so reconnecting the
    // same account looked brand-new and lost its original connection date.
    const { store, groups } = createStore();
    const service = new ConnectionService({ store });

    await service.saveConnection(auth, {
      accountId: "acct-1",
      username: "u",
      accessToken: "IGQVJXsecret1234567890abcdefgh",
      tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000),
    });
    await service.disconnect(auth);

    const stored = JSON.stringify([...groups.values()]);
    expect(stored).toContain("acct-1");
    expect(stored).not.toContain("IGQVJXsecret");
  });

  it("resets connection history when a DIFFERENT account connects", async () => {
    const { store } = createStore();
    const service = new ConnectionService({ store });

    await service.saveConnection(auth, {
      accountId: "acct-1",
      username: "a",
      accessToken: "t",
      tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000),
    });
    const second = await service.saveConnection(auth, {
      accountId: "acct-2",
      username: "b",
      accessToken: "t",
      tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000),
    });

    expect(second.username).toBe("b");
    expect(second.lastSyncAt).toBeUndefined();
  });

  it("clears the token on disconnect", async () => {
    const { store, groups } = createStore();
    const service = new ConnectionService({ store });

    await service.saveConnection(auth, {
      accountId: "a",
      username: "u",
      accessToken: "IGQVJXsecret1234567890abcdefgh",
      tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000),
    });
    await service.disconnect(auth);

    expect(JSON.stringify([...groups.values()])).not.toContain("IGQVJXsecret");
    expect((await service.getPublicConnection("site-a")).status).toBe("not_connected");
  });

  it("returns no token when the connection needs re-auth", async () => {
    const { store } = createStore();
    const service = new ConnectionService({ store });

    await service.saveConnection(auth, {
      accountId: "a",
      username: "u",
      accessToken: "t",
      tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000),
    });
    await service.markNeedsReauth(auth, "expired");

    expect(await service.getUsableToken(auth)).toBeNull();
  });

  it("marks an expired token as needing re-auth instead of using it", async () => {
    const { store } = createStore();
    const service = new ConnectionService({ store });

    await service.saveConnection(auth, {
      accountId: "a",
      username: "u",
      accessToken: "t",
      tokenExpiresAt: new Date(Date.now() - 1000),
    });

    expect(await service.getUsableToken(auth)).toBeNull();
    expect((await service.getPublicConnection("site-a")).status).toBe("needs_reauth");
  });

  it("isolates sites — Site B cannot see Site A's connection", async () => {
    const { store } = createStore();
    const service = new ConnectionService({ store });

    await service.saveConnection(auth, {
      accountId: "a",
      username: "site-a-account",
      accessToken: "t",
      tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000),
    });

    expect((await service.getPublicConnection("site-b")).status).toBe("not_connected");
  });
});

// ── Sync scheduling ──

const settings = (overrides: Partial<InstagramSettings> = {}) =>
  parseSettings({ autoSync: true, syncInterval: "1h", ...overrides });

describe("isSyncDue", () => {
  it("never runs when auto-sync is off", () => {
    expect(isSyncDue(settings({ autoSync: false }), undefined).due).toBe(false);
  });

  it("never runs on the manual interval", () => {
    expect(isSyncDue(settings({ syncInterval: "manual" }), undefined).due).toBe(false);
  });

  it("runs on the first sync", () => {
    expect(isSyncDue(settings(), undefined).due).toBe(true);
  });

  it("does not run before the interval has elapsed", () => {
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const result = isSyncDue(settings(), recent);
    expect(result.due).toBe(false);
    expect(result.reason).toContain("Next sync in");
  });

  it("runs once the interval has elapsed", () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(isSyncDue(settings(), old).due).toBe(true);
  });

  it("runs when the stored timestamp is unparseable", () => {
    expect(isSyncDue(settings(), "garbage").due).toBe(true);
  });
});

describe("settings parsing", () => {
  it("defaults to safe values", () => {
    const parsed = parseSettings({});
    // Draft-by-default prevents an import silently publishing a back catalogue.
    expect(parsed.importStatus).toBe("DRAFT");
    expect(parsed.autoSync).toBe(false);
    expect(parsed.publishByDefault).toBe(false);
    expect(parsed.archiveMedia).toBe(true);
  });

  it("falls back to defaults on malformed stored settings", () => {
    expect(parseSettings({ syncInterval: "every-second" }).syncInterval).toBe("6h");
  });
});
