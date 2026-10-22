/**
 * Connection management — status and disconnect.
 *
 * DELETE destroys the stored credential and stops synchronisation and
 * publishing. It does NOT delete archived content: the archive belongs to the
 * website, and removing an API connection is not consent to erase history.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import { INSTAGRAM_PERMISSIONS } from "@nextpress/plugin-instagram-post";
import { connectionService } from "@/lib/instagram/adapters";

export async function GET(): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.read).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(await connectionService.getPublicConnection(auth.siteId), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE(): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.manageConnection).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectionService.disconnect(auth);

  return NextResponse.json({
    status: "disconnected",
    message: "Instagram has been disconnected. Archived posts remain on this website.",
  });
}
