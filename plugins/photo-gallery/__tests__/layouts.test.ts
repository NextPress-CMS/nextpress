import { describe, it, expect } from "vitest";
import {
  mosaicSpans,
  nextIndex,
  prevIndex,
  clampIndex,
  reorder,
  gridColumnCount,
  aspectToCss,
  computeSizes,
  shouldEagerLoad,
  positionLabel,
} from "../lib/layouts";
import type { GalleryImage, GalleryLayout } from "../lib/schema";

function img(id: string): GalleryImage {
  return { id, mediaId: id, url: "u", width: 1, height: 1, alt: "", variants: {} };
}

describe("mosaicSpans", () => {
  it("handles small galleries", () => {
    expect(mosaicSpans(0)).toEqual([]);
    expect(mosaicSpans(1)).toEqual([{ colSpan: 6, rowSpan: 2 }]);
    expect(mosaicSpans(2)).toEqual([
      { colSpan: 3, rowSpan: 2 },
      { colSpan: 3, rowSpan: 2 },
    ]);
    expect(mosaicSpans(3)).toEqual([
      { colSpan: 4, rowSpan: 2 },
      { colSpan: 2, rowSpan: 1 },
      { colSpan: 2, rowSpan: 1 },
    ]);
  });

  it("produces N positive spans for large galleries and is deterministic", () => {
    const a = mosaicSpans(20);
    const b = mosaicSpans(20);
    expect(a).toHaveLength(20);
    expect(a).toEqual(b);
    for (const s of a) {
      expect(s.colSpan).toBeGreaterThan(0);
      expect(s.rowSpan).toBeGreaterThan(0);
    }
  });
});

describe("index navigation (wrapping)", () => {
  it("nextIndex wraps last -> 0", () => {
    expect(nextIndex(4, 5)).toBe(0);
    expect(nextIndex(0, 5)).toBe(1);
    expect(nextIndex(0, 0)).toBe(0);
  });

  it("prevIndex wraps 0 -> last", () => {
    expect(prevIndex(0, 5)).toBe(4);
    expect(prevIndex(3, 5)).toBe(2);
    expect(prevIndex(0, 0)).toBe(0);
  });

  it("clampIndex clamps below and above range", () => {
    expect(clampIndex(-5, 5)).toBe(0);
    expect(clampIndex(99, 5)).toBe(4);
    expect(clampIndex(2, 5)).toBe(2);
    expect(clampIndex(2, 0)).toBe(0);
  });
});

describe("reorder", () => {
  it("moves an item and leaves the original array unchanged", () => {
    const list = ["a", "b", "c", "d"];
    const result = reorder(list, 0, 2);
    expect(result).toEqual(["b", "c", "a", "d"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });

  it("returns an unchanged copy for out-of-range from", () => {
    const list = ["a", "b", "c"];
    expect(reorder(list, 9, 0)).toEqual(["a", "b", "c"]);
  });

  it("clamps a to-index beyond the end", () => {
    expect(reorder(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
  });
});

describe("css helpers", () => {
  it("gridColumnCount", () => {
    expect(gridColumnCount("auto")).toBeNull();
    expect(gridColumnCount("3")).toBe(3);
  });

  it("aspectToCss", () => {
    expect(aspectToCss("original")).toBeNull();
    expect(aspectToCss("square")).toBe("1 / 1");
    expect(aspectToCss("16:9")).toBe("16 / 9");
  });

  it("computeSizes returns a vw string for every layout", () => {
    const layouts: GalleryLayout[] = ["mosaic", "masonry", "grid", "showcase"];
    for (const layout of layouts) {
      expect(computeSizes(layout, "auto")).toContain("vw");
    }
  });
});

describe("shouldEagerLoad", () => {
  it("showcase eager-loads only index 0", () => {
    expect(shouldEagerLoad(0, "showcase")).toBe(true);
    expect(shouldEagerLoad(1, "showcase")).toBe(false);
  });

  it("other layouts eager-load the first three", () => {
    expect(shouldEagerLoad(0, "grid")).toBe(true);
    expect(shouldEagerLoad(2, "grid")).toBe(true);
    expect(shouldEagerLoad(3, "grid")).toBe(false);
  });
});

describe("positionLabel", () => {
  it("renders a 1-based n / total", () => {
    expect(positionLabel(0, [img("a"), img("b"), img("c")])).toBe("1 / 3");
  });
});
