import { z } from "zod";
import { slugSchema, routeSlugSchema, paginationSchema } from "../validation/schemas";

export const createTaxonomySchema = z.object({
  slug: routeSlugSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  hierarchical: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  contentTypes: z.array(z.string()).default([]),
});
export type CreateTaxonomyInput = z.infer<typeof createTaxonomySchema>;

export const createTermSchema = z.object({
  taxonomyId: z.string().cuid(),
  name: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(1000).optional(),
  parentId: z.string().cuid().optional().nullable(),
  sortOrder: z.number().int().default(0),
});
export type CreateTermInput = z.infer<typeof createTermSchema>;

export const updateTermSchema = createTermSchema.partial().omit({ taxonomyId: true });
export type UpdateTermInput = z.infer<typeof updateTermSchema>;

export interface TaxonomyDto {
  id: string;
  siteId: string;
  slug: string;
  name: string;
  description: string | null;
  hierarchical: boolean;
  isSystem: boolean;
  isPublic: boolean;
  contentTypes: string[];
  termCount: number;
}

export interface TermDto {
  id: string;
  taxonomyId: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  meta: Record<string, unknown>;
  children: TermDto[];
  contentCount: number;
}
