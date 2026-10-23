import { describe, it, expect } from "vitest";
import type { MediaAssetDto } from "@nextpress/core/media/media-types";
import {
  mediaAssetToGalleryImage,
  buildSrcSet,
  primarySrc,
  thumbSrc,
  largeSrc,
} from "../lib/media";
import type { GalleryImage } from "../lib/schema";

function makeAsset(overrides: Partial<MediaAssetDto> = {}): MediaAssetDto {
  return {
    id: "asset-1",
    siteId: "site-1",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    size: 1234,
    width: 1600,
    height: 1200,
    duration: null,
    url: "https://cdn/photo.jpg",
    alt: "A photo",
    title: null,
    caption: "Caption text",
    focalPoint: null,
    variants: {
      thumbnail: { url: "https://cdn/thumb.jpg", width: 150, height: 150 },
      medium: { url: "https://cdn/medium.jpg", width: 768, height: 576 },
    },
    meta: {},
    uploader: { id: "u1", name: "Uploader" },
    createdAt: new Date(),
    updatedAt: new Date(),
    isImage: true,
    ...overrides,
  };
}

function makeImage(overrides: Partial<GalleryImage> = {}): GalleryImage {
  return {
    id: "i1",
    mediaId: "m1",
    url: "https://cdn/orig.jpg",
    width: 1600,
    height: 1200,
    alt: "",
    variants: {},
    ...overrides,
  };
}

describe("mediaAssetToGalleryImage", () => {
  it("returns null for non-image assets", () => {
    expect(mediaAssetToGalleryImage(makeAsset({ isImage: false }))).toBeNull();
  });

  it("copies core fields and maps variants for an image asset", () => {
    const img = mediaAssetToGalleryImage(makeAsset());
    expect(img).not.toBeNull();
    if (!img) return;
    expect(img.mediaId).toBe("asset-1");
    expect(img.url).toBe("https://cdn/photo.jpg");
    expect(img.width).toBe(1600);
    expect(img.height).toBe(1200);
    expect(img.alt).toBe("A photo");
    expect(img.caption).toBe("Caption text");
    expect(img.variants.thumbnail).toEqual({ url: "https://cdn/thumb.jpg", width: 150, height: 150 });
    expect(img.variants.medium).toEqual({ url: "https://cdn/medium.jpg", width: 768, height: 576 });
    expect(typeof img.id).toBe("string");
    expect(img.id.length).toBeGreaterThan(0);
  });

  it("falls back to empty alt and undefined caption when null", () => {
    const img = mediaAssetToGalleryImage(makeAsset({ alt: null, caption: null }));
    expect(img?.alt).toBe("");
    expect(img?.caption).toBeUndefined();
  });
});

describe("buildSrcSet", () => {
  it("returns ascending, comma-joined srcset including the original width", () => {
    const img = makeImage({
      width: 1600,
      variants: {
        thumbnail: { url: "https://cdn/t.jpg", width: 150, height: 150 },
        small: { url: "https://cdn/s.jpg", width: 300, height: 300 },
        medium: { url: "https://cdn/m.jpg", width: 768, height: 576 },
      },
    });
    expect(buildSrcSet(img)).toBe(
      "https://cdn/t.jpg 150w, https://cdn/s.jpg 300w, https://cdn/m.jpg 768w, https://cdn/orig.jpg 1600w",
    );
  });

  it("dedupes widths already present in variants", () => {
    const img = makeImage({
      width: 150,
      variants: { thumbnail: { url: "https://cdn/t.jpg", width: 150, height: 150 } },
    });
    expect(buildSrcSet(img)).toBe("https://cdn/t.jpg 150w");
  });

  it("returns undefined when there are no variants and no width", () => {
    expect(buildSrcSet(makeImage({ width: null, variants: {} }))).toBeUndefined();
  });
});

describe("src preference helpers", () => {
  it("primarySrc prefers medium, then small, then large, then url", () => {
    expect(
      primarySrc(makeImage({ variants: {
        medium: { url: "med", width: 768, height: 1 },
        small: { url: "sm", width: 300, height: 1 },
      } })),
    ).toBe("med");
    expect(primarySrc(makeImage({ variants: { small: { url: "sm", width: 300, height: 1 } } }))).toBe("sm");
    expect(primarySrc(makeImage({ variants: { large: { url: "lg", width: 1200, height: 1 } } }))).toBe("lg");
    expect(primarySrc(makeImage({ variants: {} }))).toBe("https://cdn/orig.jpg");
  });

  it("thumbSrc prefers thumbnail, then small, then medium, then url", () => {
    expect(thumbSrc(makeImage({ variants: {
      thumbnail: { url: "th", width: 150, height: 1 },
      small: { url: "sm", width: 300, height: 1 },
    } }))).toBe("th");
    expect(thumbSrc(makeImage({ variants: { small: { url: "sm", width: 300, height: 1 } } }))).toBe("sm");
    expect(thumbSrc(makeImage({ variants: {} }))).toBe("https://cdn/orig.jpg");
  });

  it("largeSrc prefers large, then og, then url", () => {
    expect(largeSrc(makeImage({ variants: {
      large: { url: "lg", width: 1200, height: 1 },
      og: { url: "og", width: 1200, height: 630 },
    } }))).toBe("lg");
    expect(largeSrc(makeImage({ variants: { og: { url: "og", width: 1200, height: 630 } } }))).toBe("og");
    expect(largeSrc(makeImage({ variants: {} }))).toBe("https://cdn/orig.jpg");
  });
});
