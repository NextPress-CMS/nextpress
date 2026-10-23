import { describe, it, expect } from "vitest";
import {
  gallerySettingsDefaults,
  parseSettings,
  findCollection,
  resolveRenderMode,
  createCollection,
  upsertCollection,
  removeCollection,
  setCollectionImages,
  type Collection,
} from "../lib/collections";
import type { GalleryImage } from "../lib/schema";

const img = (id: string): GalleryImage => ({
  id,
  mediaId: `m_${id}`,
  url: `https://cdn.test/${id}.jpg`,
  width: 800,
  height: 600,
  alt: "",
  variants: {},
});

describe("gallery settings defaults", () => {
  it("defaults to server render mode and no collections", () => {
    expect(gallerySettingsDefaults).toEqual({
      renderMode: "server",
      collections: [],
    });
  });

  it("parseSettings falls back to defaults on malformed input", () => {
    expect(parseSettings({ renderMode: "nonsense" })).toEqual(
      gallerySettingsDefaults,
    );
    expect(parseSettings({})).toEqual(gallerySettingsDefaults);
  });

  it("parseSettings accepts valid settings", () => {
    const col = createCollection("Trip");
    const parsed = parseSettings({ renderMode: "client", collections: [col] });
    expect(parsed.renderMode).toBe("client");
    expect(parsed.collections).toHaveLength(1);
    expect(parsed.collections[0]?.name).toBe("Trip");
  });
});

describe("resolveRenderMode", () => {
  it("uses the site default when block choice is 'default'", () => {
    expect(resolveRenderMode("server", "default")).toBe("server");
    expect(resolveRenderMode("client", "default")).toBe("client");
  });
  it("lets an explicit block choice override the default", () => {
    expect(resolveRenderMode("server", "client")).toBe("client");
    expect(resolveRenderMode("client", "server")).toBe("server");
  });
});

describe("collection CRUD (pure, immutable)", () => {
  it("createCollection makes a named, empty, id'd collection", () => {
    const c = createCollection("  My Trip  ");
    expect(c.name).toBe("My Trip");
    expect(c.images).toEqual([]);
    expect(c.id).toMatch(/^col_/);
    expect(typeof c.createdAt).toBe("string");
  });

  it("createCollection falls back to a title for blank names", () => {
    expect(createCollection("   ").name).toBe("Untitled collection");
  });

  it("upsertCollection adds then updates without mutating input", () => {
    const base = gallerySettingsDefaults;
    const c = createCollection("A");
    const added = upsertCollection(base, c);
    expect(base.collections).toHaveLength(0); // immutable
    expect(added.collections).toHaveLength(1);

    const renamed: Collection = { ...c, name: "A2" };
    const updated = upsertCollection(added, renamed);
    expect(updated.collections).toHaveLength(1);
    expect(updated.collections[0]?.name).toBe("A2");
  });

  it("removeCollection removes by id", () => {
    const c = createCollection("A");
    const added = upsertCollection(gallerySettingsDefaults, c);
    const removed = removeCollection(added, c.id);
    expect(removed.collections).toHaveLength(0);
  });

  it("findCollection returns the match or null", () => {
    const c = createCollection("A");
    const s = upsertCollection(gallerySettingsDefaults, c);
    expect(findCollection(s, c.id)?.id).toBe(c.id);
    expect(findCollection(s, "missing")).toBeNull();
    expect(findCollection(s, "")).toBeNull();
  });

  it("setCollectionImages replaces images immutably", () => {
    const c = createCollection("A");
    const withImgs = setCollectionImages(c, [img("1"), img("2")]);
    expect(c.images).toHaveLength(0); // original untouched
    expect(withImgs.images).toHaveLength(2);
    expect(withImgs.images[0]?.id).toBe("1");
  });
});
