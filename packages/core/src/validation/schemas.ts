/**
 * Shared Zod schemas used across the CMS.
 * Domain-specific schemas live in their own *-types.ts files.
 * This file holds cross-cutting schemas (pagination, ids, etc.)
 */

import { z } from "zod";
import { SLUG_PATTERN, SLUG_MAX_LENGTH } from "./slug";

// ── Primitives ──

export const cuidSchema = z.string().cuid();

export const slugSchema = z
  .string()
  .min(1)
  .max(SLUG_MAX_LENGTH)
  .regex(SLUG_PATTERN, "Must be lowercase alphanumeric with hyphens");

export const optionalSlugSchema = slugSchema.optional();

/**
 * Slugs owned by fixed app routes. Content types are served by the
 * /admin/[contentType] catch-all and taxonomies by the public [...slug]
 * catch-all, so a type or taxonomy with one of these slugs would be shadowed
 * by the static route and become unreachable.
 *
 * Keep in sync with the static segments under apps/web/app.
 */
export const RESERVED_ROUTE_SLUGS: ReadonlySet<string> = new Set([
  // /admin/<segment>
  "appearance", "comments", "content-types", "fields", "media", "menus",
  "plugins", "posts", "profile", "settings", "taxonomies", "users",
  // Public site and auth routes
  "admin", "api", "login", "logout", "register", "forgot-password",
  "reset-password", "search", "preview", "feed", "sitemap",
  // Next.js and common static asset paths
  "static", "public", "assets", "skins",
]);

/** A slug that will be used as a top-level URL segment. */
export const routeSlugSchema = slugSchema.refine(
  (s) => !RESERVED_ROUTE_SLUGS.has(s),
  (s) => ({ message: `"${s}" is reserved by a built-in route. Choose another slug.` }),
);

// ── Pagination ──

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export function paginate<T>(
  items: T[],
  total: number,
  input: PaginationInput,
): PaginatedResult<T> {
  return {
    items,
    total,
    page: input.page,
    perPage: input.perPage,
    totalPages: Math.ceil(total / input.perPage),
  };
}

// ── Sort / Filter ──

export const sortOrderSchema = z.enum(["asc", "desc"]).default("desc");

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// ── Content Status ──

export const contentStatusSchema = z.enum([
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "SCHEDULED",
  "PRIVATE",
  "ARCHIVED",
  "TRASH",
]);

export type ContentStatusInput = z.infer<typeof contentStatusSchema>;

// ── Block Data ──
// BlockData is defined in @nextpress/blocks (canonical source).
// Re-exported here so core consumers don't need to import from blocks.

import type { BlockData as _BlockData } from "@nextpress/blocks";
export type BlockData = _BlockData;

export const blockDataSchema: z.ZodType<BlockData, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.record(z.unknown()),
    innerBlocks: z.array(blockDataSchema).default([]),
  }),
);
