import { describe, it, expect } from "vitest";
import {
  photoGallerySchema,
  photoGalleryDefaults,
  galleryImageSchema,
  PHOTO_GALLERY_VERSION,
  PHOTO_GALLERY_BLOCK_TYPE,
} from "../lib/schema";

describe("photoGalleryDefaults", () => {
  it("matches the opinionated defaults", () => {
    expect(photoGalleryDefaults).toEqual({
      collectionId: "",
      images: [],
      renderMode: "default",
      layout: "mosaic",
      columns: "auto",
      gap: "medium",
      radius: "medium",
      aspectRatio: "original",
      lightbox: true,
      showCaptions: true,
      captionMode: "below",
      showImageCount: true,
      hoverEffect: "subtleZoom",
    });
  });

  it("exposes stable version + block type constants", () => {
    expect(PHOTO_GALLERY_VERSION).toBe(1);
    expect(PHOTO_GALLERY_BLOCK_TYPE).toBe("plugin/photo-gallery");
  });
});

describe("photoGallerySchema", () => {
  it("parses an empty object into the defaults", () => {
    const parsed = photoGallerySchema.parse({});
    expect(parsed).toEqual(photoGalleryDefaults);
  });

  it("rejects invalid layout enum via safeParse", () => {
    const result = photoGallerySchema.safeParse({ layout: "carousel" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid gap enum via safeParse", () => {
    const result = photoGallerySchema.safeParse({ gap: "enormous" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed images array (non-object entries)", () => {
    const result = photoGallerySchema.safeParse({ images: ["not-an-object", 42] });
    expect(result.success).toBe(false);
  });
});

describe("galleryImageSchema", () => {
  it("validates a well-formed image and applies alt/variants defaults", () => {
    const parsed = galleryImageSchema.parse({
      id: "i1",
      mediaId: "m1",
      url: "https://cdn/x.jpg",
      width: 800,
      height: 600,
    });
    expect(parsed.alt).toBe("");
    expect(parsed.variants).toEqual({});
    expect(parsed.caption).toBeUndefined();
  });

  it("accepts explicit alt, caption, and variants", () => {
    const parsed = galleryImageSchema.parse({
      id: "i1",
      mediaId: "m1",
      url: "https://cdn/x.jpg",
      width: 800,
      height: 600,
      alt: "A cat",
      caption: "meow",
      variants: { medium: { url: "https://cdn/m.jpg", width: 400, height: 300 } },
    });
    expect(parsed.alt).toBe("A cat");
    expect(parsed.caption).toBe("meow");
    expect(parsed.variants.medium?.url).toBe("https://cdn/m.jpg");
  });

  it("requires id, mediaId, and url", () => {
    expect(galleryImageSchema.safeParse({ mediaId: "m1", url: "u" }).success).toBe(false);
    expect(galleryImageSchema.safeParse({ id: "i1", url: "u" }).success).toBe(false);
    expect(galleryImageSchema.safeParse({ id: "i1", mediaId: "m1" }).success).toBe(false);
  });

  it("allows null width/height (unknown intrinsic dimensions)", () => {
    const parsed = galleryImageSchema.parse({
      id: "i1",
      mediaId: "m1",
      url: "u",
      width: null,
      height: null,
    });
    expect(parsed.width).toBeNull();
    expect(parsed.height).toBeNull();
  });
});
