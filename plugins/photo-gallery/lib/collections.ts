import { z } from "zod";
import { galleryImageSchema, GALLERY_RENDER_MODE } from "./schema";
import type { GalleryImage, GalleryRenderMode } from "./schema";

/**
 * Collections + plugin settings.
 *
 * A Collection is a named, reusable set of Media Library images. Collections
 * live in the plugin's site-scoped settings store (ctx.settings), NOT in a
 * dedicated database table — a gallery block references a collection by id and
 * carries a resolved image snapshot so the public renderer stays DB-free.
 *
 * The plugin owns NO media of its own: every image is a reference to an asset
 * in the existing NextPress Media Library (mediaId + serialized variants).
 */

export const collectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  /** Serialized Media Library images (same self-contained shape as a block). */
  images: z.array(galleryImageSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Collection = z.infer<typeof collectionSchema>;

/**
 * The full plugin settings object stored under group `plugin:photo-gallery`.
 * `renderMode` is the site-wide default a per-block setting can override.
 */
export const gallerySettingsSchema = z.object({
  renderMode: z.enum(GALLERY_RENDER_MODE).default("server"),
  collections: z.array(collectionSchema).default([]),
});
export type GallerySettings = z.infer<typeof gallerySettingsSchema>;

export const gallerySettingsDefaults: GallerySettings =
  gallerySettingsSchema.parse({});

/** Parse a raw settings record (from ctx.settings.get) into typed settings. */
export function parseSettings(raw: Record<string, unknown>): GallerySettings {
  const result = gallerySettingsSchema.safeParse(raw);
  return result.success ? result.data : gallerySettingsDefaults;
}

/** Find a collection by id, or null. */
export function findCollection(
  settings: GallerySettings,
  collectionId: string,
): Collection | null {
  if (!collectionId) return null;
  return settings.collections.find((c) => c.id === collectionId) ?? null;
}

/** Resolve the effective render mode for a block given its per-block choice. */
export function resolveRenderMode(
  siteDefault: GalleryRenderMode,
  blockChoice: "default" | "server" | "client",
): GalleryRenderMode {
  if (blockChoice === "server" || blockChoice === "client") return blockChoice;
  return siteDefault;
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Create a new empty collection (pure). */
export function createCollection(name: string): Collection {
  const now = new Date().toISOString();
  return {
    id: newId("col"),
    name: name.trim() || "Untitled collection",
    images: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Immutably upsert a collection into settings. */
export function upsertCollection(
  settings: GallerySettings,
  collection: Collection,
): GallerySettings {
  const exists = settings.collections.some((c) => c.id === collection.id);
  const stamped: Collection = { ...collection, updatedAt: new Date().toISOString() };
  return {
    ...settings,
    collections: exists
      ? settings.collections.map((c) => (c.id === collection.id ? stamped : c))
      : [...settings.collections, stamped],
  };
}

/** Immutably remove a collection. */
export function removeCollection(
  settings: GallerySettings,
  collectionId: string,
): GallerySettings {
  return {
    ...settings,
    collections: settings.collections.filter((c) => c.id !== collectionId),
  };
}

/** Set a collection's images (immutable). */
export function setCollectionImages(
  collection: Collection,
  images: GalleryImage[],
): Collection {
  return { ...collection, images, updatedAt: new Date().toISOString() };
}
