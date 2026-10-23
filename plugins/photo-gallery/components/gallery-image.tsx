import type { CSSProperties } from "react";
import type { GalleryImage, GalleryLayout, GalleryColumns } from "../lib/schema";
import { buildSrcSet, primarySrc } from "../lib/media";
import { computeSizes, shouldEagerLoad } from "../lib/layouts";

/**
 * A single responsive gallery <img>. Server-safe (no client code).
 * Preserves intrinsic width/height to minimise cumulative layout shift and
 * builds srcset/sizes from the serialized variant set — no DB access.
 */
interface Props {
  image: GalleryImage;
  index: number;
  layout: GalleryLayout;
  columns: GalleryColumns;
  /** When set, the cell enforces this CSS aspect-ratio (object-fit: cover). */
  aspectCss: string | null;
  style?: CSSProperties;
}

export function GalleryImageEl({
  image,
  index,
  layout,
  columns,
  aspectCss,
  style,
}: Props) {
  const srcSet = buildSrcSet(image);
  const eager = shouldEagerLoad(index, layout);

  return (
    <img
      className="np-pg__img"
      src={primarySrc(image)}
      srcSet={srcSet}
      sizes={srcSet ? computeSizes(layout, columns) : undefined}
      alt={image.alt}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      // @ts-expect-error fetchpriority is a valid HTML attribute not yet in the
      // React 18 DOM typings; harmless string prop, improves LCP for the hero.
      fetchpriority={eager && index === 0 ? "high" : undefined}
      style={aspectCss ? { ...style, aspectRatio: aspectCss } : style}
    />
  );
}
