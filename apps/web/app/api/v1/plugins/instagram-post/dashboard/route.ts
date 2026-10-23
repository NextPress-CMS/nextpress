/**
 * Dashboard data — connection status and archive counters.
 *
 * Returns a `PublicConnection`, which by construction contains no token. The
 * secret boundary lives in the plugin's schema module, so no route can leak a
 * credential by forgetting to strip a field.
 */

import { NextResponse } from "next/server";
import { prisma } from "@nextpress/db";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import { IG_FIELDS, INSTAGRAM_PERMISSIONS } from "@nextpress/plugin-instagram-post";
import { connectionService } from "@/lib/instagram/adapters";

export async function GET(): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.read).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connection = await connectionService.getPublicConnection(auth.siteId);

  // One grouped query rather than five counts — the dashboard is polled and a
  // per-status round trip would be pure waste.
  const [syncCounts, publishCounts] = await Promise.all([
    countByFieldValue(auth.siteId, IG_FIELDS.syncStatus),
    countByFieldValue(auth.siteId, IG_FIELDS.publishStatus),
  ]);

  return NextResponse.json(
    {
      connection,
      stats: {
        imported: syncCounts.IMPORTED ?? 0,
        pending: (syncCounts.IMPORT_PENDING ?? 0) + (syncCounts.IMPORTING ?? 0),
        failed: (syncCounts.IMPORT_FAILED ?? 0) + (syncCounts.RETRY_PENDING ?? 0),
        published: publishCounts.PUBLISHED ?? 0,
        publishFailed: publishCounts.PUBLISH_FAILED ?? 0,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function countByFieldValue(
  siteId: string,
  fieldKey: string,
): Promise<Record<string, number>> {
  const rows = await prisma.fieldValue.findMany({
    where: {
      fieldDefinition: { key: fieldKey, siteId },
      contentEntry: { siteId },
    },
    select: { value: true },
  });

  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = typeof row.value === "string" ? row.value : String(row.value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
