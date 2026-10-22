/**
 * The `instagram-post` content type and its mapping rules.
 *
 * Imported posts are ordinary NextPress content entries. That is the whole
 * point: they inherit search, SEO, sitemaps, revisions, permalinks, caching,
 * and the editor for free, and the public site renders them without ever
 * touching Instagram.
 */

import type { z } from "zod";
import {
  createContentTypeSchema,
  type CreateContentTypeInput,
} from "@nextpress/core/content-type/content-type-types";
import type { InstagramMedia } from "../api/instagram-types";

export const INSTAGRAM_CONTENT_TYPE = "instagram-post";

/** Pre-validation input, so schema defaults may be omitted. */
type ContentTypeInput = z.input<typeof createContentTypeSchema>;

const contentTypeDeclaration: Omit<ContentTypeInput, "slug"> & { slug: string } = {
  slug: INSTAGRAM_CONTENT_TYPE,
  namePlural: "Instagram Posts",
  nameSingular: "Instagram Post",
  description: "Posts archived from a connected Instagram account.",
  menuIcon: "instagram",
  isPublic: true,
  hasArchive: true,
  // No "comments": an archived Instagram post's discussion lives on Instagram.
  supports: ["title", "editor", "excerpt", "thumbnail", "revisions", "custom-fields"],
  menuPosition: 25,
};

/** Registration-ready definition with schema defaults applied. */
export const instagramContentTypeDefinition: Omit<CreateContentTypeInput, "slug"> & {
  slug: string;
} = createContentTypeSchema.parse(contentTypeDeclaration);

// ── Title derivation ──

/**
 * Instagram posts have no title, so one is derived deterministically:
 * the same media always yields the same title, which keeps re-imports stable.
 *
 * Preference order:
 *   1. First meaningful line of the caption, trimmed to a sane length.
 *   2. "Instagram Post — {date}" when there is no usable caption.
 */
const MAX_TITLE_LENGTH = 80;

export function deriveTitle(media: Pick<InstagramMedia, "caption" | "timestamp">): string {
  const caption = media.caption?.trim();

  if (caption) {
    const firstLine = caption
      .split(/\r?\n/)
      .map((line) => line.trim())
      // Skip pure hashtag/mention lines — they make useless titles.
      .find((line) => line.length > 0 && !/^[#@]/.test(line));

    if (firstLine) {
      const cleaned = firstLine.replace(/\s+/g, " ").trim();
      if (cleaned.length <= MAX_TITLE_LENGTH) return cleaned;

      // Cut on a word boundary rather than mid-word when one is nearby.
      const truncated = cleaned.slice(0, MAX_TITLE_LENGTH);
      const lastSpace = truncated.lastIndexOf(" ");
      return `${(lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}…`;
    }
  }

  return `Instagram Post — ${formatDate(media.timestamp)}`;
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toISOString().slice(0, 10);
}

/**
 * Deterministic slug seed derived from the Instagram media id.
 *
 * Deliberately NOT caption-derived: captions are edited on Instagram and
 * frequently duplicated, whereas the media id is stable and unique. The core
 * `uniqueSlug` helper still applies its own collision suffix, so this feeds
 * the existing slug pipeline rather than replacing it.
 */
export function deriveSlug(mediaId: string): string {
  return `instagram-${mediaId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`;
}

// ── Caption preservation ──

/**
 * Convert a caption into blocks for the editor.
 *
 * The caption is preserved verbatim — Unicode, emoji, hashtags, mentions and
 * line breaks intact. Blank lines separate paragraphs; single newlines are
 * kept inside a paragraph, matching how Instagram renders them.
 */
export function captionToBlocks(caption: string | undefined): Array<{
  type: string;
  attrs: Record<string, unknown>;
}> {
  if (!caption?.trim()) return [];

  return caption
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => ({ type: "paragraph", attrs: { content: paragraph } }));
}

/** Excerpt for listings and SEO descriptions. */
const MAX_EXCERPT_LENGTH = 160;

export function deriveExcerpt(caption: string | undefined): string | undefined {
  if (!caption?.trim()) return undefined;

  const flattened = caption.replace(/\s+/g, " ").trim();
  if (flattened.length <= MAX_EXCERPT_LENGTH) return flattened;

  const truncated = flattened.slice(0, MAX_EXCERPT_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 100 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}…`;
}

/** Extract hashtags — useful for taxonomy mapping and search. */
export function extractHashtags(caption: string | undefined): string[] {
  if (!caption) return [];
  // Unicode-aware: hashtags are frequently non-Latin.
  const matches = caption.matchAll(/#([\p{L}\p{N}_]+)/gu);
  return [...new Set([...matches].map((m) => (m[1] ?? "").toLowerCase()).filter(Boolean))];
}

export function extractMentions(caption: string | undefined): string[] {
  if (!caption) return [];
  const matches = caption.matchAll(/@([A-Za-z0-9._]+)/g);
  return [...new Set([...matches].map((m) => (m[1] ?? "").toLowerCase()).filter(Boolean))];
}
