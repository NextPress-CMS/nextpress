import type { CSSProperties } from "react";
import type { BlockRenderProps } from "@nextpress/blocks";
import "../styles/gallery.css";
import type { PhotoGalleryAttributes, GalleryImage } from "../lib/schema";
import { GalleryImageEl } from "./gallery-image";
import GalleryLightboxMount from "./gallery-lightbox-mount";
import {
  aspectToCss,
  gapToCss,
  gridColumnCount,
  mosaicSpans,
  radiusToCss,
} from "../lib/layouts";
import { largeSrc } from "../lib/media";

/**
 * Server-side gallery renderer. Emits real, crawlable HTML with alt text and
 * captions (works with no JavaScript). A small JSON payload is embedded for
 * the client lightbox to progressively enhance — no data is re-fetched.
 *
 * All styling is scoped under `.np-pg` (see styles/gallery.css) and driven by
 * CSS custom properties so it inherits the surrounding theme.
 */

function figureCaption(image: GalleryImage, mode: string, showCaptions: boolean) {
  if (!showCaptions || mode === "hidden" || !image.caption) return null;
  const cls = mode === "overlay" ? "np-pg__cap np-pg__cap--overlay" : "np-pg__cap";
  return <figcaption className={cls}>{image.caption}</figcaption>;
}

export default function PhotoGalleryRender({
  attributes,
  className,
}: BlockRenderProps<PhotoGalleryAttributes>) {
  const {
    images,
    layout,
    columns,
    gap,
    radius,
    aspectRatio,
    lightbox,
    showCaptions,
    captionMode,
    showImageCount,
    hoverEffect,
  } = attributes;

  // Empty state: render nothing (no broken wrapper).
  if (!images || images.length === 0) return null;

  const aspectCss = aspectToCss(aspectRatio);
  const rootStyle = {
    "--np-pg-gap": gapToCss(gap),
    "--np-pg-radius": radiusToCss(radius),
  } as CSSProperties;

  const rootClass = [
    className ?? "",
    "np-pg",
    `np-pg--${layout}`,
    `np-pg--hover-${hoverEffect}`,
    `np-pg--cap-${captionMode}`,
  ]
    .filter(Boolean)
    .join(" ");

  // Lightbox payload: only what the viewer needs, largest source per image.
  const lightboxData = lightbox
    ? images.map((img) => ({
        src: largeSrc(img),
        alt: img.alt,
        caption: showCaptions && captionMode !== "hidden" ? img.caption ?? "" : "",
        w: img.width,
        h: img.height,
      }))
    : null;

  const single = images.length === 1;

  return (
    <div
      className={rootClass}
      style={rootStyle}
      data-lightbox={lightbox ? "true" : "false"}
      data-count={images.length}
    >
      {renderLayout({
        layout,
        images,
        columns,
        aspectCss,
        lightbox,
        showCaptions,
        captionMode,
        single,
      })}

      {showImageCount && images.length > 1 && (
        <p className="np-pg__count" aria-hidden="true">
          {images.length} photos
        </p>
      )}

      {lightboxData && (
        <>
          <script
            type="application/json"
            className="np-pg__data"
            // Safe: JSON.stringify with escaped "<"; parsed as data, never executed.
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(lightboxData).replace(/</g, "\\u003c"),
            }}
          />
          <GalleryLightboxMount />
        </>
      )}
    </div>
  );
}

interface LayoutArgs {
  layout: PhotoGalleryAttributes["layout"];
  images: GalleryImage[];
  columns: PhotoGalleryAttributes["columns"];
  aspectCss: string | null;
  lightbox: boolean;
  showCaptions: boolean;
  captionMode: string;
  single: boolean;
}

function itemWrapper(
  args: LayoutArgs,
  image: GalleryImage,
  index: number,
  extraStyle?: CSSProperties,
) {
  const { layout, columns, aspectCss, lightbox, showCaptions, captionMode } = args;
  const inner = (
    <>
      <GalleryImageEl
        image={image}
        index={index}
        layout={layout}
        columns={columns}
        aspectCss={aspectCss}
      />
      {figureCaption(image, captionMode, showCaptions)}
    </>
  );

  return (
    <figure
      key={image.id}
      className="np-pg__item"
      style={extraStyle}
      data-index={index}
    >
      {lightbox ? (
        <button
          type="button"
          className="np-pg__trigger"
          aria-label={
            image.alt ? `View photo: ${image.alt}` : `View photo ${index + 1}`
          }
          data-pg-open={index}
        >
          {inner}
        </button>
      ) : (
        inner
      )}
    </figure>
  );
}

function renderLayout(args: LayoutArgs) {
  const { layout, images, single } = args;

  if (single) {
    return (
      <div className="np-pg__single">{itemWrapper(args, images[0]!, 0)}</div>
    );
  }

  switch (layout) {
    case "grid": {
      const n = gridColumnCount(args.columns);
      const style = n
        ? ({ "--np-pg-cols": String(n) } as CSSProperties)
        : undefined;
      return (
        <div className="np-pg__grid" style={style}>
          {images.map((img, i) => itemWrapper(args, img, i))}
        </div>
      );
    }

    case "masonry":
      return (
        <div className="np-pg__masonry">
          {images.map((img, i) => itemWrapper(args, img, i))}
        </div>
      );

    case "showcase": {
      const [hero, ...rest] = images;
      return (
        <div className="np-pg__showcase">
          <div className="np-pg__showcase-main">
            {itemWrapper(args, hero!, 0)}
          </div>
          {rest.length > 0 && (
            <div className="np-pg__showcase-strip" role="list">
              {rest.map((img, i) =>
                itemWrapper(args, img, i + 1, undefined),
              )}
            </div>
          )}
        </div>
      );
    }

    case "mosaic":
    default: {
      const spans = mosaicSpans(images.length);
      return (
        <div className="np-pg__mosaic">
          {images.map((img, i) => {
            const s = spans[i] ?? { colSpan: 2, rowSpan: 1 };
            const style = {
              "--np-pg-col-span": String(s.colSpan),
              "--np-pg-row-span": String(s.rowSpan),
            } as CSSProperties;
            return itemWrapper(args, img, i, style);
          })}
        </div>
      );
    }
  }
}
