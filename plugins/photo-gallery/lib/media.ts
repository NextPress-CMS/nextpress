import type { MediaAssetDto, ImageVariant } from "@nextpress/core/media/media-types";
import type { GalleryImage, GalleryVariant } from "./schema";

/**
 * Media serialization + responsive-image helpers.
 *
 * The gallery serializes everything the renderer needs into block attributes
 * at edit time, so the public render path never queries the database.
 */

/** Preferred variant ordering, smallest → largest. */
const VARIANT_ORDER = ["thumbnail", "small", "medium", "large", "og"] as const;

function generateItemId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Convert a MediaAssetDto (from the media picker) into a self-contained
 * GalleryImage suitable for serialization into block attributes.
 * Non-image assets return null (the gallery only accepts images).
 */
export function mediaAssetToGalleryImage(asset: MediaAssetDto): GalleryImage | null {
  if (!asset.isImage) return null;

  const variants: Record<string, GalleryVariant> = {};
  const sourceVariants: Record<string, ImageVariant> = asset.variants ?? {};
  for (const name of Object.keys(sourceVariants)) {
    const v = sourceVariants[name];
    if (v && typeof v.url === "string") {
      variants[name] = { url: v.url, width: v.width, height: v.height };
    }
  }

  return {
    id: generateItemId(),
    mediaId: asset.id,
    url: asset.url,
    width: asset.width,
    height: asset.height,
    alt: asset.alt ?? "",
    caption: asset.caption ?? undefined,
    variants,
  };
}

/** Build a `srcset` string from an image's variants (+ original as fallback). */
export function buildSrcSet(image: GalleryImage): string | undefined {
  const entries: string[] = [];
  const seen = new Set<number>();

  for (const name of VARIANT_ORDER) {
    const v: ImageVariant | undefined = image.variants[name];
    if (v && !seen.has(v.width)) {
      entries.push(`${v.url} ${v.width}w`);
      seen.add(v.width);
    }
  }

  // Include the original at its intrinsic width as the largest candidate.
  if (image.width && !seen.has(image.width)) {
    entries.push(`${image.url} ${image.width}w`);
    seen.add(image.width);
  }

  return entries.length > 0 ? entries.join(", ") : undefined;
}

/**
 * The smallest reasonable source for the `src` fallback (used by browsers
 * that ignore srcset). Prefers a mid-size variant to avoid a blurry flash.
 */
export function primarySrc(image: GalleryImage): string {
  return (
    image.variants.medium?.url ??
    image.variants.small?.url ??
    image.variants.large?.url ??
    image.url
  );
}

/** A small thumbnail source, for editor previews and filmstrip strips. */
export function thumbSrc(image: GalleryImage): string {
  return (
    image.variants.thumbnail?.url ??
    image.variants.small?.url ??
    image.variants.medium?.url ??
    image.url
  );
}

/** The largest available source, for the lightbox. */
export function largeSrc(image: GalleryImage): string {
  // `url` is always a non-empty string (the original), so it is the final
  // fallback after the larger variants.
  return image.variants.large?.url ?? image.variants.og?.url ?? image.url;
}
