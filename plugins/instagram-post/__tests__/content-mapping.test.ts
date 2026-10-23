import { describe, expect, it } from "vitest";
import {
  captionToBlocks,
  deriveExcerpt,
  deriveSlug,
  deriveTitle,
  extractHashtags,
  extractMentions,
} from "../src/content/content-type";
import {
  carouselPost,
  emptyCaptionPost,
  hashtagOnlyPost,
  imagePost,
  unicodeCaptionPost,
} from "../src/api/fixtures";

describe("deriveTitle", () => {
  it("uses the first meaningful caption line", () => {
    expect(deriveTitle(imagePost)).toBe("Morning light over the harbour.");
  });

  it("falls back to a dated title when there is no caption", () => {
    expect(deriveTitle(emptyCaptionPost)).toBe("Instagram Post — 2026-08-12");
  });

  it("skips hashtag-only lines rather than titling a post with tags", () => {
    expect(deriveTitle(hashtagOnlyPost)).toBe("Instagram Post — 2026-08-10");
  });

  it("preserves non-Latin script and emoji", () => {
    expect(deriveTitle(unicodeCaptionPost)).toBe("صبح بخیر ☀️");
  });

  it("truncates long captions on a word boundary", () => {
    const title = deriveTitle({
      caption:
        "This is an extremely long Instagram caption that keeps going well past any reasonable title length limit and must be truncated",
      timestamp: "2026-01-01T00:00:00+0000",
    });

    expect(title.length).toBeLessThanOrEqual(81);
    expect(title.endsWith("…")).toBe(true);
    // Word-boundary truncation must not leave a partial word before the ellipsis.
    expect(title).not.toMatch(/\s…$/);
  });

  it("is deterministic — the same media always yields the same title", () => {
    expect(deriveTitle(imagePost)).toBe(deriveTitle(imagePost));
  });

  it("handles an unparseable timestamp without throwing", () => {
    expect(deriveTitle({ caption: undefined, timestamp: "not-a-date" })).toBe(
      "Instagram Post — Unknown date",
    );
  });
});

describe("deriveSlug", () => {
  it("derives the slug from the media id, not the caption", () => {
    expect(deriveSlug(imagePost.id)).toBe(`instagram-${imagePost.id}`);
  });

  it("produces different slugs for different media", () => {
    expect(deriveSlug(imagePost.id)).not.toBe(deriveSlug(carouselPost.id));
  });

  it("strips characters that are illegal in a slug", () => {
    expect(deriveSlug("abc_DEF-123")).toBe("instagram-abcdef123");
  });
});

describe("captionToBlocks", () => {
  it("returns no blocks for an absent caption", () => {
    expect(captionToBlocks(undefined)).toEqual([]);
    expect(captionToBlocks("   ")).toEqual([]);
  });

  it("splits on blank lines into paragraphs", () => {
    const blocks = captionToBlocks("First paragraph.\n\nSecond paragraph.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.attrs.content).toBe("First paragraph.");
  });

  it("keeps single newlines inside a paragraph, as Instagram renders them", () => {
    const blocks = captionToBlocks("Line one\nLine two");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.attrs.content).toBe("Line one\nLine two");
  });

  it("preserves emoji, hashtags and mentions verbatim", () => {
    const blocks = captionToBlocks(unicodeCaptionPost.caption);
    const text = blocks.map((b) => b.attrs.content).join("\n\n");

    expect(text).toContain("☀️");
    expect(text).toContain("@example_partner");
    expect(text).toContain("#استودیو");
    expect(text).toContain("صبح بخیر");
  });
});

describe("deriveExcerpt", () => {
  it("returns undefined when there is no caption", () => {
    expect(deriveExcerpt(undefined)).toBeUndefined();
  });

  it("flattens whitespace", () => {
    expect(deriveExcerpt("A\n\nB")).toBe("A B");
  });

  it("truncates to the excerpt limit", () => {
    const excerpt = deriveExcerpt("word ".repeat(100));
    expect(excerpt!.length).toBeLessThanOrEqual(161);
    expect(excerpt!.endsWith("…")).toBe(true);
  });
});

describe("hashtag and mention extraction", () => {
  it("extracts unicode hashtags", () => {
    const tags = extractHashtags(unicodeCaptionPost.caption);
    expect(tags).toContain("morning");
    expect(tags).toContain("استودیو");
    expect(tags).toContain("behindthescenes");
  });

  it("deduplicates and lowercases", () => {
    expect(extractHashtags("#Sun #sun #SUN")).toEqual(["sun"]);
  });

  it("extracts mentions", () => {
    expect(extractMentions(unicodeCaptionPost.caption)).toContain("example_partner");
  });

  it("returns empty arrays for an absent caption", () => {
    expect(extractHashtags(undefined)).toEqual([]);
    expect(extractMentions(undefined)).toEqual([]);
  });
});
