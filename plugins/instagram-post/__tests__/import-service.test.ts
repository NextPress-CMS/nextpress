import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@nextpress/core/auth/auth-types";
import { FakeInstagramClient } from "../src/api/fake-instagram-client";
import { allFixturePosts, carouselPost, generatePosts, imagePost, noMediaUrlPost } from "../src/api/fixtures";
import { IG_FIELDS } from "../src/content/fields";
import { ImportService, type ContentStore } from "../src/services/import-service";
import type { MediaUploader } from "../src/services/media-service";

const auth = { siteId: "site-a", user: { id: "u1" }, role: "administrator", permissions: {} } as unknown as AuthContext;

/**
 * In-memory content store mirroring the host adapter's contract.
 * `findByInstagramMediaId` is the idempotency primitive under test.
 */
function createStore() {
  const entries = new Map<string, { id: string; title: string; slug: string; fields: Record<string, unknown> }>();
  const byMediaId = new Map<string, string>();
  const attachments = new Map<string, string[]>();
  let counter = 0;

  const store: ContentStore = {
    async findByInstagramMediaId(siteId, mediaId) {
      // Site-scoped, exactly like the Prisma implementation.
      const id = byMediaId.get(`${siteId}:${mediaId}`);
      return id ? (entries.get(id) ?? null) : null;
    },
    async createEntry(a, input) {
      const id = `entry-${++counter}`;
      entries.set(id, { id, title: input.title, slug: input.slug, fields: { ...input.fields } });
      const mediaId = input.fields[IG_FIELDS.mediaId];
      if (typeof mediaId === "string") byMediaId.set(`${a.siteId}:${mediaId}`, id);
      return { id, slug: input.slug };
    },
    async updateEntry(_a, entryId, input) {
      const entry = entries.get(entryId);
      if (entry && input.fields) Object.assign(entry.fields, input.fields);
    },
    async attachMedia(_a, entryId, mediaIds) {
      attachments.set(entryId, [...(attachments.get(entryId) ?? []), ...mediaIds]);
    },
  };

  return { store, entries, byMediaId, attachments };
}

function createUploader(): MediaUploader & { uploads: number } {
  let uploads = 0;
  return {
    get uploads() {
      return uploads;
    },
    async upload(_auth, buffer, input) {
      uploads++;
      return { id: `asset-${uploads}`, filename: input.filename, mimeType: input.mimeType, size: buffer.length } as never;
    },
  };
}

/** Fetch stub returning a valid JPEG so archiving succeeds deterministically. */
function fakeFetch(): typeof fetch {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
  return vi.fn(async () =>
    new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } }),
  ) as unknown as typeof fetch;
}

function createService(client: FakeInstagramClient, store: ContentStore, archive = false) {
  return new ImportService({
    client,
    content: store,
    uploader: createUploader(),
    archiveMediaEnabled: archive,
    importStatus: "DRAFT",
    fetchImpl: fakeFetch(),
  });
}

describe("import idempotency", () => {
  let client: FakeInstagramClient;
  let ctx: ReturnType<typeof createStore>;

  beforeEach(() => {
    client = new FakeInstagramClient({ media: allFixturePosts });
    ctx = createStore();
  });

  it("imports each post exactly once", async () => {
    const service = createService(client, ctx.store);
    const result = await service.run(auth, { limit: null });

    expect(result.imported).toBe(allFixturePosts.length);
    expect(ctx.entries.size).toBe(allFixturePosts.length);
  });

  it("creates NO duplicates when run twice", async () => {
    const service = createService(client, ctx.store);
    await service.run(auth, { limit: null });
    const second = await service.run(auth, { limit: null });

    // The whole contract: one media id ⇒ one entry, however many runs happen.
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(allFixturePosts.length);
    expect(ctx.entries.size).toBe(allFixturePosts.length);
  });

  it("creates no duplicates when two runs overlap (concurrent cron)", async () => {
    const service = createService(client, ctx.store);
    await Promise.all([service.run(auth, { limit: null }), service.run(auth, { limit: null })]);
    expect(ctx.entries.size).toBe(allFixturePosts.length);
  });

  it("refreshes an existing entry instead of duplicating it", async () => {
    const service = createService(client, ctx.store);
    await service.run(auth, { limit: null });

    const before = ctx.entries.size;
    const result = await service.run(auth, { limit: null, refreshExisting: true });

    expect(ctx.entries.size).toBe(before);
    expect(result.imported).toBe(allFixturePosts.length);
  });

  it("keys identity on the media id, never on the caption", async () => {
    const service = createService(client, ctx.store);
    await service.run(auth, { limit: null });

    // Two distinct posts sharing a caption must remain two entries.
    const duplicateCaption = new FakeInstagramClient({
      media: [
        { ...imagePost, id: "new-1", caption: "Same caption" },
        { ...imagePost, id: "new-2", caption: "Same caption" },
      ],
    });
    await createService(duplicateCaption, ctx.store).run(auth, { limit: null });

    expect(ctx.byMediaId.has("site-a:new-1")).toBe(true);
    expect(ctx.byMediaId.has("site-a:new-2")).toBe(true);
  });
});

describe("site isolation", () => {
  it("keeps each site's mappings separate", async () => {
    const ctx = createStore();
    const siteB = { ...auth, siteId: "site-b" } as AuthContext;

    await createService(new FakeInstagramClient({ media: [imagePost] }), ctx.store).run(auth, { limit: null });
    await createService(new FakeInstagramClient({ media: [imagePost] }), ctx.store).run(siteB, { limit: null });

    // The same Instagram post archived by two sites yields two independent
    // entries — neither site can see or clobber the other's.
    expect(ctx.entries.size).toBe(2);
    expect(ctx.byMediaId.get(`site-a:${imagePost.id}`)).not.toBe(
      ctx.byMediaId.get(`site-b:${imagePost.id}`),
    );
  });
});

describe("pagination and resumability", () => {
  it("walks a large account in pages", async () => {
    const client = new FakeInstagramClient({ media: generatePosts(120), pageSize: 25 });
    const ctx = createStore();

    const result = await createService(client, ctx.store).run(auth, { limit: null });

    expect(result.imported).toBe(120);
    expect(client.countCalls("listMedia")).toBeGreaterThan(1);
  });

  it("returns a cursor so the next batch resumes exactly where it stopped", async () => {
    const client = new FakeInstagramClient({ media: generatePosts(50) });
    const ctx = createStore();
    const service = createService(client, ctx.store);

    const first = await service.run(auth, { limit: 10 });
    expect(first.imported).toBe(10);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.run(auth, { limit: 10, cursor: first.nextCursor ?? undefined });
    expect(second.imported).toBe(10);
    expect(ctx.entries.size).toBe(20);
  });

  it("stops at the first known post during incremental sync", async () => {
    const client = new FakeInstagramClient({ media: generatePosts(50) });
    const ctx = createStore();
    const service = createService(client, ctx.store);

    await service.run(auth, { limit: null });
    client.calls.length = 0;

    // A routine sync must cost one page, not a full walk.
    const sync = await service.run(auth, { limit: 50, stopAtKnown: true });
    expect(sync.imported).toBe(0);
    expect(client.countCalls("listMedia")).toBe(1);
  });
});

describe("media archiving", () => {
  it("archives every child of a carousel", async () => {
    const client = new FakeInstagramClient({ media: [carouselPost] });
    const ctx = createStore();

    await createService(client, ctx.store, true).run(auth, { limit: null });

    const entryId = ctx.byMediaId.get(`site-a:${carouselPost.id}`)!;
    expect(ctx.attachments.get(entryId)).toHaveLength(3);
  });

  it("still archives the post when Instagram withholds media_url", async () => {
    // Meta omits media_url for copyrighted audio — the caption, date and
    // permalink are still worth keeping.
    const client = new FakeInstagramClient({ media: [noMediaUrlPost] });
    const ctx = createStore();

    const result = await createService(client, ctx.store, true).run(auth, { limit: null });
    expect(result.imported).toBe(1);
  });

  it("skips downloads entirely when archiving is disabled", async () => {
    const client = new FakeInstagramClient({ media: [carouselPost] });
    const ctx = createStore();

    await createService(client, ctx.store, false).run(auth, { limit: null });
    expect(ctx.attachments.size).toBe(0);
  });
});

describe("failure handling", () => {
  it("aborts the whole run on an expired token", async () => {
    const client = new FakeInstagramClient({ media: allFixturePosts });
    client.failures.listMedia = "auth";

    await expect(createService(client, createStore().store).run(auth, { limit: null })).rejects.toMatchObject({
      category: "auth",
    });
  });

  it("aborts on a rate limit rather than hammering the API", async () => {
    const client = new FakeInstagramClient({ media: allFixturePosts });
    client.failures.listMedia = "rate_limit";

    await expect(createService(client, createStore().store).run(auth, { limit: null })).rejects.toMatchObject({
      category: "rate_limit",
    });
  });
});

describe("preview", () => {
  it("reports new vs already-archived without writing", async () => {
    const client = new FakeInstagramClient({ media: allFixturePosts });
    const ctx = createStore();
    const service = createService(client, ctx.store);

    await service.run(auth, { limit: 3 });
    const preview = await service.preview("site-a", allFixturePosts.length);

    expect(preview.discovered).toBe(allFixturePosts.length);
    expect(preview.alreadyArchived).toBe(3);
    expect(preview.newPosts).toBe(allFixturePosts.length - 3);
    // Read-only: entry count is unchanged by a preview.
    expect(ctx.entries.size).toBe(3);
  });
});
