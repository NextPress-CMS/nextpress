/**
 * "Instagram Posts" block.
 *
 * Renders archived posts from LOCAL NextPress content. It issues no Instagram
 * request — not on the server, not in the browser. That is a hard requirement:
 * a public page that depended on Instagram would be slow, rate-limited,
 * unreliable, and invisible to crawlers whenever the API had a bad day.
 *
 * Media is served from NextPress storage, so images keep working after
 * Instagram's signed CDN URLs expire.
 */

import type { BlockDefinition } from "@nextpress/blocks";
import { z } from "zod";

export const instagramArchiveAttrsSchema = z.object({
  /** How many posts to show. Capped to keep a page render bounded. */
  count: z.number().int().min(1).max(48).default(12),
  layout: z.enum(["grid", "list", "carousel"]).default("grid"),
  columns: z.number().int().min(1).max(6).default(3),
  showCaptions: z.boolean().default(true),
  showDates: z.boolean().default(true),
  /** Link back to the original post on Instagram. */
  showInstagramLink: z.boolean().default(true),
  /** Paginate rather than rendering one long list. */
  paginate: z.boolean().default(false),
});

export type InstagramArchiveAttrs = z.infer<typeof instagramArchiveAttrsSchema>;

export const instagramArchiveBlock: Omit<
  BlockDefinition<typeof instagramArchiveAttrsSchema>,
  "source"
> = {
  type: "instagram/archive",
  title: "Instagram Posts",
  description: "Display posts archived from your connected Instagram account.",
  icon: "instagram",
  category: "embed",
  keywords: ["instagram", "social", "gallery", "feed", "archive"],

  // The Zod schema is the single source of truth for attribute validation.
  attributesSchema: instagramArchiveAttrsSchema,
  defaultAttributes: instagramArchiveAttrsSchema.parse({}),

  version: 1,
  allowsInnerBlocks: false,

  /**
   * Editor-only for now: rendering requires a site-scoped content query, which
   * belongs in the host theme/template rather than in a block module that is
   * also imported by the editor bundle.
   */
  renderComponent: null,
};

/** Validate stored attributes, falling back to defaults on malformed data. */
export function parseArchiveAttrs(raw: unknown): InstagramArchiveAttrs {
  const result = instagramArchiveAttrsSchema.safeParse(raw ?? {});
  return result.success ? result.data : instagramArchiveAttrsSchema.parse({});
}
