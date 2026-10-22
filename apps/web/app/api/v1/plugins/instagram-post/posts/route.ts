/**
 * Archived posts listing for the admin table.
 *
 * Source and sync status are mapped to plain labels here rather than in the
 * client, so provenance ("Instagram" vs "Website") has one definition.
 */

import { NextResponse } from "next/server";
import { prisma } from "@nextpress/db";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import { IG_FIELDS, INSTAGRAM_CONTENT_TYPE, INSTAGRAM_PERMISSIONS } from "@nextpress/plugin-instagram-post";

const SYNC_LABELS: Record<string, string> = {
  IMPORTED: "Synced",
  IMPORTING: "Pending",
  IMPORT_PENDING: "Pending",
  RETRY_PENDING: "Retrying",
  IMPORT_FAILED: "Failed",
};

export async function GET(request: Request): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.read).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const take = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 100);

  const entries = await prisma.contentEntry.findMany({
    where: { siteId: auth.siteId, contentType: { slug: INSTAGRAM_CONTENT_TYPE } },
    orderBy: { publishedAt: "desc" },
    take,
    select: {
      id: true,
      title: true,
      slug: true,
      publishedAt: true,
      fieldValues: {
        select: { value: true, fieldDefinition: { select: { key: true } } },
      },
      mediaAttachments: {
        take: 1,
        orderBy: { sortOrder: "asc" },
        select: { mediaAsset: { select: { variants: true, url: true } } },
      },
    },
  });

  const items = entries.map((entry) => {
    const fields = Object.fromEntries(
      entry.fieldValues.map((v) => [v.fieldDefinition.key, v.value]),
    );

    const asset = entry.mediaAttachments[0]?.mediaAsset;
    const variants = (asset?.variants ?? {}) as Record<string, { url?: string }>;

    return {
      id: entry.id,
      title: entry.title,
      slug: entry.slug,
      // Prefer the generated thumbnail so the table does not pull full images.
      thumbnailUrl: variants.thumbnail?.url ?? asset?.url,
      source: fields[IG_FIELDS.source] === "nextpress" ? "Website" : "Instagram",
      syncStatus: SYNC_LABELS[String(fields[IG_FIELDS.syncStatus])] ?? "Pending",
      mediaType: fields[IG_FIELDS.mediaType] as string | undefined,
      instagramPermalink: fields[IG_FIELDS.permalink] as string | undefined,
      publishedAt: entry.publishedAt?.toISOString(),
      lastSyncedAt: fields[IG_FIELDS.lastSyncedAt] as string | undefined,
      error: fields[IG_FIELDS.lastError] as string | undefined,
    };
  });

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
