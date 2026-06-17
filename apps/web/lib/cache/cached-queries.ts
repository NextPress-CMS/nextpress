import "server-only";

/**
 * Cached Data Queries
 *
 * Wraps Prisma queries with Next.js unstable_cache + cache tags.
 * These are the ONLY functions that public site routes should use
 * for data fetching. Admin routes use tRPC (no caching needed).
 *
 * Every cached function:
 *   1. Has a unique cache key (based on arguments)
 *   2. Is tagged with the appropriate CacheTags
 *   3. Has a revalidate interval (fallback TTL if tag-based revalidation fails)
 *   4. Returns plain serializable objects (no Prisma models)
 *
 * When content is published/updated/deleted, the tRPC router calls
 * the revalidation functions in lib/cache/revalidate.ts, which
 * invalidate the matching tags. Next.js then regenerates the pages
 * that depend on those tags on the next request.
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@nextpress/db";
import { CacheTags } from "./tags";

// ── Revalidation intervals (fallback if tag-based fails) ──

const FIVE_MINUTES = 300;
const ONE_HOUR = 3600;

// ── Content entry (single page) ──

export function getCachedEntry(siteId: string, slug: string) {
  return unstable_cache(
    async () => {
      return prisma.contentEntry.findFirst({
        where: { siteId, slug, status: "PUBLISHED" },
        select: ENTRY_SELECT,
      });
    },
    [`entry-${siteId}-${slug}`],
    {
      tags: [
        // We don't know the ID yet, so tag with a slug-based key.
        // The content-list tag covers this case via list invalidation.
        CacheTags.contentList("_all", siteId),
      ],
      revalidate: FIVE_MINUTES,
    },
  )();
}

export function getCachedEntryById(siteId: string, id: string) {
  return unstable_cache(
    async () => {
      return prisma.contentEntry.findFirst({
        where: { id, siteId, status: "PUBLISHED" },
        select: ENTRY_SELECT,
      });
    },
    [`entry-id-${id}`],
    {
      tags: [CacheTags.content(id)],
      revalidate: FIVE_MINUTES,
    },
  )();
}

// ── Content list (archive pages, homepage) ──

export function getCachedEntryList(
  siteId: string,
  options: {
    contentTypeSlug?: string;
    limit?: number;
    termId?: string;
    sortBy?: "publishedAt" | "menuOrder";
  } = {},
) {
  const { contentTypeSlug, limit = 20, termId, sortBy = "publishedAt" } = options;
  const cacheKey = `entries-${siteId}-${contentTypeSlug ?? "all"}-${termId ?? "none"}-${limit}-${sortBy}`;

  return unstable_cache(
    async () => {
      const where: any = { siteId, status: "PUBLISHED" };
      if (contentTypeSlug) {
        const ct = await prisma.contentType.findUnique({
          where: { siteId_slug: { siteId, slug: contentTypeSlug } },
        });
        if (ct) where.contentTypeId = ct.id;
      }
      if (termId) {
        where.terms = { some: { termId } };
      }

      const orderBy = sortBy === "menuOrder"
        ? [{ menuOrder: "asc" as const }, { publishedAt: "desc" as const }]
        : { publishedAt: "desc" as const };

      return prisma.contentEntry.findMany({
        where,
        orderBy,
        take: limit,
        select: ENTRY_SELECT,
      });
    },
    [cacheKey],
    {
      tags: [
        CacheTags.contentList(contentTypeSlug ?? "_all", siteId),
        ...(termId ? [] : [CacheTags.homepage(siteId)]),
      ],
      revalidate: FIVE_MINUTES,
    },
  )();
}

// ── Taxonomy term with entries ──

export function getCachedTermWithEntries(siteId: string, termSlug: string) {
  return unstable_cache(
    async () => {
      const term = await prisma.term.findFirst({
        where: { slug: termSlug, taxonomy: { siteId } },
        include: { taxonomy: true },
      });
      if (!term) return null;

      const entries = await prisma.contentEntry.findMany({
        where: { siteId, status: "PUBLISHED", terms: { some: { termId: term.id } } },
        orderBy: { publishedAt: "desc" },
        take: 20,
        select: ENTRY_SELECT,
      });

      return { term, entries };
    },
    [`term-${siteId}-${termSlug}`],
    {
      tags: [CacheTags.taxonomy(termSlug, siteId)],
      revalidate: FIVE_MINUTES,
    },
  )();
}

// ── Menu by location ──

export function getCachedMenu(siteId: string, location: string) {
  return unstable_cache(
    async () => {
      return prisma.menu.findUnique({
        where: { siteId_location: { siteId, location } },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      });
    },
    [`menu-${siteId}-${location}`],
    {
      tags: [CacheTags.menu(location, siteId)],
      revalidate: ONE_HOUR,
    },
  )();
}

// ── Site settings ──

export function getCachedSettings(siteId: string) {
  return unstable_cache(
    async () => {
      const settings = await prisma.setting.findMany({
        where: { siteId },
      });
      const map: Record<string, unknown> = {};
      for (const s of settings) map[`${s.group}.${s.key}`] = s.value;
      return map;
    },
    [`settings-${siteId}`],
    {
      tags: [CacheTags.settings(siteId)],
      revalidate: ONE_HOUR,
    },
  )();
}

// ── Theme install ──

export function getCachedThemeInstall(siteId: string) {
  return unstable_cache(
    async () => {
      return prisma.themeInstall.findFirst({
        where: { siteId, isActive: true },
      });
    },
    [`theme-${siteId}`],
    {
      tags: [CacheTags.site(siteId)],
      revalidate: ONE_HOUR,
    },
  )();
}

// ── Shared select for content entries ──

const ENTRY_SELECT = {
  id: true, title: true, slug: true, excerpt: true, blocks: true,
  status: true, template: true, publishedAt: true, createdAt: true, updatedAt: true,
  contentType: { select: { id: true, slug: true, nameSingular: true, hierarchical: true } },
  author: { select: { id: true, name: true, displayName: true, image: true } },
  fieldValues: { select: { value: true, fieldDefinition: { select: { key: true } } } },
  terms: { select: { term: { select: { id: true, name: true, slug: true, taxonomy: { select: { slug: true, name: true } } } } } },
  mediaAttachments: {
    where: { role: "featured_image" as const }, take: 1,
    select: { mediaAsset: { select: { id: true, url: true, alt: true, width: true, height: true } } },
  },
  _count: { select: { revisions: true } },
} as const;
