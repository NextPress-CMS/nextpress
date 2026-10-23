import { z } from "zod";
import { slugSchema } from "../validation/schemas";

// ── Input DTOs ──

export const createContentTypeSchema = z.object({
  slug: slugSchema,
  nameSingular: z.string().min(1).max(100),
  namePlural: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  hierarchical: z.boolean().default(false),
  hasArchive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  menuIcon: z.string().default("file-text"),
  menuPosition: z.number().int().min(0).default(20),
  supports: z
    .array(
      z.enum([
        "title",
        "editor",
        "excerpt",
        "thumbnail",
        "comments",
        "revisions",
        "custom-fields",
        "page-attributes",
      ]),
    )
    .default(["title", "editor", "excerpt", "thumbnail", "revisions"]),
  settings: z.record(z.unknown()).default({}),
});

// z.input, not z.infer: the service parses this itself, so callers may omit
// fields the schema defaults (hasArchive, supports, menuPosition, ...).
export type CreateContentTypeInput = z.input<typeof createContentTypeSchema>;

export const updateContentTypeSchema = createContentTypeSchema
  .partial()
  .omit({ slug: true });

export type UpdateContentTypeInput = z.infer<typeof updateContentTypeSchema>;

// ── Output DTO ──

export interface ContentTypeDto {
  id: string;
  siteId: string;
  slug: string;
  nameSingular: string;
  namePlural: string;
  description: string | null;
  isSystem: boolean;
  hierarchical: boolean;
  hasArchive: boolean;
  isPublic: boolean;
  menuIcon: string;
  menuPosition: number;
  supports: string[];
  settings: Record<string, unknown>;
  fieldCount: number;
  entryCount: number;
}
