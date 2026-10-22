/**
 * Manual "Sync Now".
 *
 * POST only: synchronisation writes content, so it must not sit behind a GET
 * that a crawler or prefetch could trigger.
 *
 * `force` skips the interval check but never the connection or token checks,
 * so a manual sync on a broken connection reports the problem instead of
 * silently doing nothing.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import { INSTAGRAM_PERMISSIONS } from "@nextpress/plugin-instagram-post";
import { createSyncService } from "@/lib/instagram/adapters";

export async function POST(): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.import).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await createSyncService().syncSite(auth, true);

  return NextResponse.json(
    {
      ...result,
      ...(result.ran ? {} : { error: result.reason }),
    },
    { status: result.ran ? 200 : 409, headers: { "Cache-Control": "no-store" } },
  );
}
