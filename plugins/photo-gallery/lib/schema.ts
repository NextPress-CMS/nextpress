import { z } from "zod";

/**
 * Photo Gallery — attribute schema (single source of truth).
 *
 * Design notes:
 *  - Everything the public renderer needs is serialized INTO the block
 *    attributes at edit time. The render path never touches the database:
 *    each image carries its responsive `variants`, intrinsic `width`/`height`,
 *    `alt`, and optional `caption`. This mirrors (and extends) the DB-free
 *    convention of the core image block.
 *  - `mediaId` is retained as a stable reference for future re-resolution
 *    (e.g. re-syncing alt text) but is NEVER required at render time.
 */

/** A single responsive image variant (matches core ImageVariant). */
export const galleryVariantSchema = z.object({
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type GalleryVariant = z.infer<typeof galleryVariantSchema>;

/**
 * A gallery image. Self-contained: no runtime media fetch required.
 * `variants` is a partial map (small originals may lack larger sizes),
 * so consumers must always null-check individual entries.
 */
export const galleryImageSchema = z.object({
  /** Unique per-item id (stable across reorders; used as React key). */
  id: z.string(),
  /** Source MediaAsset id — stable reference, not needed for render. */
  mediaId: z.string(),
  /** Original/full URL — the srcset fallback and largest source. */
  url: z.string(),
  /** Intrinsic dimensions of the original — used to prevent layout shift. */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  /** Meaningful alternative text. Empty string = intentionally decorative. */
  alt: z.string().default(""),
  /** Optional caption (plain text — rendered as text, never HTML). */
  caption: z.string().optional(),
  /** Responsive variants keyed by size name (thumbnail/small/medium/large/og). */
  variants: z.record(z.string(), galleryVariantSchema).default({}),
});
export type GalleryImage = z.infer<typeof galleryImageSchema>;

export const GALLERY_LAYOUTS = ["mosaic", "masonry", "grid", "showcase"] as const;
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number];

export const GALLERY_COLUMNS = ["auto", "2", "3", "4"] as const;
export type GalleryColumns = (typeof GALLERY_COLUMNS)[number];

export const GALLERY_GAP = ["none", "small", "medium", "large"] as const;
export type GalleryGap = (typeof GALLERY_GAP)[number];

export const GALLERY_RADIUS = ["none", "small", "medium", "large"] as const;
export type GalleryRadius = (typeof GALLERY_RADIUS)[number];

export const GALLERY_ASPECT = [
  "original",
  "square",
  "4:3",
  "3:2",
  "16:9",
  "portrait",
] as const;
export type GalleryAspect = (typeof GALLERY_ASPECT)[number];

export const GALLERY_HOVER = ["none", "subtleZoom", "fade"] as const;
export type GalleryHover = (typeof GALLERY_HOVER)[number];

export const GALLERY_CAPTION_MODE = ["below", "overlay", "hidden"] as const;
export type GalleryCaptionMode = (typeof GALLERY_CAPTION_MODE)[number];

/**
 * How a gallery is rendered on the public site.
 *  - "default"  → follow the site-wide plugin setting (renderMode).
 *  - "server"   → server-side rendered HTML (best SEO / no-JS support).
 *  - "client"   → hydrated client component (interactive-first).
 */
export const GALLERY_RENDER_MODE = ["server", "client"] as const;
export type GalleryRenderMode = (typeof GALLERY_RENDER_MODE)[number];

export const GALLERY_RENDER_CHOICE = ["default", "server", "client"] as const;
export type GalleryRenderChoice = (typeof GALLERY_RENDER_CHOICE)[number];

/**
 * Full gallery block attributes. Opinionated defaults — a gallery looks
 * excellent with zero configuration.
 */
export const photoGallerySchema = z.object({
  /**
   * Optional reference to a saved, reusable Collection (stored in plugin
   * settings). When set, the editor keeps `images` in sync with the collection
   * as a self-contained render snapshot — so the public renderer stays DB-free.
   * Empty string = an ad-hoc, block-local image set.
   */
  collectionId: z.string().default(""),

  images: z.array(galleryImageSchema).default([]),

  /** Per-block render override; "default" defers to the site-wide setting. */
  renderMode: z.enum(GALLERY_RENDER_CHOICE).default("default"),

  layout: z.enum(GALLERY_LAYOUTS).default("mosaic"),
  columns: z.enum(GALLERY_COLUMNS).default("auto"),
  gap: z.enum(GALLERY_GAP).default("medium"),
  radius: z.enum(GALLERY_RADIUS).default("medium"),
  aspectRatio: z.enum(GALLERY_ASPECT).default("original"),

  lightbox: z.boolean().default(true),
  showCaptions: z.boolean().default(true),
  captionMode: z.enum(GALLERY_CAPTION_MODE).default("below"),
  showImageCount: z.boolean().default(true),

  hoverEffect: z.enum(GALLERY_HOVER).default("subtleZoom"),
});

export type PhotoGalleryAttributes = z.infer<typeof photoGallerySchema>;

/**
 * Default attributes for a freshly inserted block. Derived from the schema
 * so it can never drift out of sync.
 */
export const photoGalleryDefaults: PhotoGalleryAttributes =
  photoGallerySchema.parse({});

/** Current schema version. Increment on breaking attribute changes. */
export const PHOTO_GALLERY_VERSION = 1;

export const PHOTO_GALLERY_BLOCK_TYPE = "plugin/photo-gallery";
