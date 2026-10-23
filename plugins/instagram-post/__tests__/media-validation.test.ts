import { describe, expect, it } from "vitest";
import {
  ALT_TEXT_MAX_LENGTH,
  CAPTION_MAX_LENGTH,
  validateCaption,
  validateCarousel,
  validateImage,
  validatePublishRequest,
  validateVideo,
} from "../src/services/media-validation";

const jpeg = { mimeType: "image/jpeg", size: 2_000_000, width: 1080, height: 1080 };
const mp4 = { mimeType: "video/mp4", size: 20_000_000, width: 1080, height: 1920, duration: 30 };

describe("image validation", () => {
  it("accepts a compliant JPEG", () => {
    expect(validateImage(jpeg).valid).toBe(true);
  });

  it("rejects PNG — Instagram accepts JPEG only", () => {
    const result = validateImage({ ...jpeg, mimeType: "image/png" });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("image_format");
  });

  it("rejects an oversized file", () => {
    expect(validateImage({ ...jpeg, size: 10 * 1024 * 1024 }).issues[0]?.code).toBe("image_size");
  });

  it("rejects an image narrower than the minimum", () => {
    expect(validateImage({ ...jpeg, width: 200, height: 200 }).issues[0]?.code).toBe(
      "image_width_min",
    );
  });

  it("rejects an image wider than the maximum", () => {
    expect(validateImage({ ...jpeg, width: 2000, height: 2000 }).issues[0]?.code).toBe(
      "image_width_max",
    );
  });

  it("accepts the portrait and landscape aspect-ratio bounds", () => {
    expect(validateImage({ ...jpeg, width: 1080, height: 1350 }).valid).toBe(true);
    expect(validateImage({ ...jpeg, width: 1080, height: 566 }).valid).toBe(true);
  });

  it("rejects a ratio outside the accepted range", () => {
    const tooTall = validateImage({ ...jpeg, width: 640, height: 1600 });
    expect(tooTall.valid).toBe(false);
    expect(tooTall.issues.some((i) => i.code === "image_aspect_ratio")).toBe(true);
  });

  it("does not fail on unknown dimensions — absence is not a violation", () => {
    expect(validateImage({ mimeType: "image/jpeg", size: 1_000_000 }).valid).toBe(true);
  });

  it("produces an actionable message, not an error code", () => {
    const message = validateImage({ ...jpeg, mimeType: "image/gif" }).issues[0]?.message ?? "";
    expect(message).toContain("JPEG");
    expect(message).not.toMatch(/^Error \d+/);
  });
});

describe("video validation", () => {
  it("accepts a compliant MP4", () => {
    expect(validateVideo(mp4).valid).toBe(true);
  });

  it("rejects a non-MP4 container", () => {
    expect(validateVideo({ ...mp4, mimeType: "video/webm" }).issues[0]?.code).toBe("video_format");
  });

  it("rejects a video above the size limit", () => {
    expect(validateVideo({ ...mp4, size: 400 * 1024 * 1024 }).issues[0]?.code).toBe("video_size");
  });

  it("rejects a video shorter than the minimum", () => {
    expect(validateVideo({ ...mp4, duration: 1 }).issues[0]?.code).toBe("video_duration_min");
  });

  it("rejects a video longer than the maximum", () => {
    expect(validateVideo({ ...mp4, duration: 20 * 60 }).issues[0]?.code).toBe("video_duration_max");
  });
});

describe("carousel validation", () => {
  it("accepts two to ten items", () => {
    expect(validateCarousel([jpeg, jpeg]).valid).toBe(true);
    expect(validateCarousel(Array(10).fill(jpeg)).valid).toBe(true);
  });

  it("rejects a single item", () => {
    expect(validateCarousel([jpeg]).issues[0]?.code).toBe("carousel_min_items");
  });

  it("rejects more than ten items", () => {
    expect(validateCarousel(Array(11).fill(jpeg)).issues[0]?.code).toBe("carousel_max_items");
  });

  it("names the offending slide", () => {
    const result = validateCarousel([jpeg, { ...jpeg, mimeType: "image/png" }]);
    expect(result.issues[0]?.message).toContain("Item 2");
  });

  it("allows mixed image and video items", () => {
    expect(validateCarousel([jpeg, mp4]).valid).toBe(true);
  });
});

describe("caption validation", () => {
  it("accepts an absent or normal caption", () => {
    expect(validateCaption(undefined).valid).toBe(true);
    expect(validateCaption("Hello #world @friend 🎉").valid).toBe(true);
  });

  it("rejects a caption over the limit", () => {
    expect(validateCaption("x".repeat(CAPTION_MAX_LENGTH + 1)).issues[0]?.code).toBe(
      "caption_length",
    );
  });
});

describe("full publish request validation", () => {
  it("accepts a valid image request", () => {
    expect(
      validatePublishRequest({
        mediaType: "IMAGE",
        items: [{ ...jpeg, url: "https://example.com/a.jpg" }],
        caption: "Hello",
      }).valid,
    ).toBe(true);
  });

  it("rejects an empty selection", () => {
    expect(validatePublishRequest({ mediaType: "IMAGE", items: [] }).issues[0]?.code).toBe(
      "no_media",
    );
  });

  it("rejects a URL Instagram could not fetch", () => {
    const result = validatePublishRequest({
      mediaType: "IMAGE",
      items: [{ ...jpeg, url: "http://localhost:3000/a.jpg" }],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects over-long alt text", () => {
    const result = validatePublishRequest({
      mediaType: "IMAGE",
      items: [{ ...jpeg, url: "https://example.com/a.jpg" }],
      altText: "x".repeat(ALT_TEXT_MAX_LENGTH + 1),
    });
    expect(result.issues.some((i) => i.code === "alt_text_length")).toBe(true);
  });

  it("collects every issue rather than stopping at the first", () => {
    const result = validatePublishRequest({
      mediaType: "IMAGE",
      items: [{ mimeType: "image/png", size: 20_000_000, width: 100, height: 100, url: "http://x.local/a.png" }],
      caption: "x".repeat(CAPTION_MAX_LENGTH + 1),
    });
    expect(result.issues.length).toBeGreaterThan(2);
  });
});
