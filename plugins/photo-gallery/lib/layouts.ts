import type {
  GalleryAspect,
  GalleryColumns,
  GalleryGap,
  GalleryImage,
  GalleryLayout,
  GalleryRadius,
} from "./schema";

/**
 * Pure layout helpers. No DOM, no React — fully unit-testable.
 * These compute the deterministic geometry the render + editor share.
 */

/** CSS gap value per gap token. */
export function gapToCss(gap: GalleryGap): string {
  switch (gap) {
    case "none":
      return "0px";
    case "small":
      return "0.375rem";
    case "large":
      return "1.25rem";
    case "medium":
    default:
      return "0.75rem";
  }
}

/** CSS border-radius value per radius token. */
export function radiusToCss(radius: GalleryRadius): string {
  switch (radius) {
    case "none":
      return "0px";
    case "small":
      return "0.25rem";
    case "large":
      return "1rem";
    case "medium":
    default:
      return "0.5rem";
  }
}

/**
 * CSS `aspect-ratio` value per aspect token, or null for "original"
 * (meaning: use the image's intrinsic ratio / natural flow).
 */
export function aspectToCss(aspect: GalleryAspect): string | null {
  switch (aspect) {
    case "square":
      return "1 / 1";
    case "4:3":
      return "4 / 3";
    case "3:2":
      return "3 / 2";
    case "16:9":
      return "16 / 9";
    case "portrait":
      return "3 / 4";
    case "original":
    default:
      return null;
  }
}

/** Fixed column count for grid layout, or null for auto-responsive. */
export function gridColumnCount(columns: GalleryColumns): number | null {
  if (columns === "auto") return null;
  return Number(columns);
}

/**
 * Adaptive mosaic column/row spans.
 *
 * Produces an intentional editorial rhythm rather than a random pattern:
 * a repeating 6-cell motif where selected cells receive a larger span.
 * Deterministic by index so SSR and client agree, and it degrades to a
 * plain flow on narrow screens (handled in CSS via container queries).
 *
 * Special-cased for very small galleries so 2–3 images look composed
 * rather than lopsided.
 */
export interface MosaicSpan {
  colSpan: number;
  rowSpan: number;
}

export function mosaicSpans(count: number): MosaicSpan[] {
  if (count <= 0) return [];
  if (count === 1) return [{ colSpan: 6, rowSpan: 2 }];
  if (count === 2) {
    return [
      { colSpan: 3, rowSpan: 2 },
      { colSpan: 3, rowSpan: 2 },
    ];
  }
  if (count === 3) {
    // One tall hero + two stacked — a deliberate editorial trio.
    return [
      { colSpan: 4, rowSpan: 2 },
      { colSpan: 2, rowSpan: 1 },
      { colSpan: 2, rowSpan: 1 },
    ];
  }

  // Repeating 6-column motif. Each period places two "feature" cells.
  const pattern: MosaicSpan[] = [
    { colSpan: 4, rowSpan: 2 }, // large left
    { colSpan: 2, rowSpan: 1 }, // small top-right
    { colSpan: 2, rowSpan: 1 }, // small bottom-right
    { colSpan: 2, rowSpan: 1 },
    { colSpan: 2, rowSpan: 1 },
    { colSpan: 2, rowSpan: 2 }, // tall right
  ];

  const spans: MosaicSpan[] = [];
  for (let i = 0; i < count; i++) {
    const base = pattern[i % pattern.length];
    // pattern is a fixed non-empty array; index is always in range, but
    // satisfy noUncheckedIndexedAccess explicitly.
    spans.push(base ?? { colSpan: 2, rowSpan: 1 });
  }
  return spans;
}

/**
 * The `sizes` attribute for responsive images, derived from layout + columns.
 * Approximate but sensible — errs toward smaller downloads on narrow screens.
 */
export function computeSizes(
  layout: GalleryLayout,
  columns: GalleryColumns,
): string {
  if (layout === "showcase") {
    return "(max-width: 640px) 100vw, 80vw";
  }
  if (layout === "grid") {
    const n = gridColumnCount(columns);
    if (n === 2) return "(max-width: 640px) 50vw, 50vw";
    if (n === 3) return "(max-width: 640px) 50vw, 33vw";
    if (n === 4) return "(max-width: 640px) 50vw, 25vw";
    return "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw";
  }
  // mosaic / masonry
  return "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";
}

/**
 * Whether an image should load eagerly (above-the-fold heuristic).
 * The first N images load eagerly; the rest lazy-load.
 */
export function shouldEagerLoad(index: number, layout: GalleryLayout): boolean {
  if (layout === "showcase") return index === 0;
  return index < 3;
}

// ── Lightbox navigation (pure, wrapping) ──

/** Next index with wrap-around: last → first. */
export function nextIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return (current + 1) % count;
}

/** Previous index with wrap-around: first → last. */
export function prevIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return (current - 1 + count) % count;
}

/** Clamp an arbitrary index into valid range. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index > count - 1) return count - 1;
  return index;
}

// ── Reorder (pure) ──

/** Move an item from one index to another, returning a new array. */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const result = list.slice();
  if (from < 0 || from >= result.length) return result;
  const [moved] = result.splice(from, 1);
  if (moved === undefined) return result;
  const target = Math.max(0, Math.min(to, result.length));
  result.splice(target, 0, moved);
  return result;
}

/** Human "n / total" position label for the lightbox. */
export function positionLabel(index: number, images: GalleryImage[]): string {
  return `${index + 1} / ${images.length}`;
}
