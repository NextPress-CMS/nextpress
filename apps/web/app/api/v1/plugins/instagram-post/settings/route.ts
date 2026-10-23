/**
 * Plugin settings — read and write.
 *
 * Reading requires `instagram_read`; writing requires
 * `instagram_manage_settings`. Both are enforced here, server-side.
 *
 * The response carries only validated settings. Connection state (and the
 * token that lives beside it) is served by the dashboard route through the
 * public projection, so this endpoint cannot leak a credential.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import { INSTAGRAM_PERMISSIONS, instagramSettingsSchema } from "@nextpress/plugin-instagram-post";
import { connectionService } from "@/lib/instagram/adapters";

export async function GET(): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.read).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(await connectionService.getSettings(auth.siteId), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: Request): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.manageSettings).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Partial so a screen can save one section without resending everything.
  const parsed = instagramSettingsSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  return NextResponse.json(await connectionService.updateSettings(auth, parsed.data));
}
