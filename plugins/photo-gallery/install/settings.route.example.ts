/**
 * Photo Gallery — settings API (host-mounted, permission-gated).
 *
 * NextPress stores plugin-registered API routes but does not yet ship a
 * catch-all dispatcher that mounts them, and plugin route handlers receive only
 * a Request (no auth context). Settings writes must be gated on
 * `manage_settings`, so this feature is served by a dedicated, properly-guarded
 * Next.js route that reads/writes through the settings service — the same
 * site-scoped store the plugin's `ctx.settings` uses (group `plugin:photo-gallery`).
 *
 * GET  → returns { renderMode, collections } for the current site.
 * PUT  → replaces settings (validated); requires `manage_settings`.
 */

import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import { settingsService } from "@nextpress/core/settings/settings-service";
import {
  parseSettings,
  gallerySettingsSchema,
} from "@nextpress/plugin-photo-gallery";

const GROUP = "plugin:photo-gallery";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return json({ error: "Unauthenticated" }, 401);
  // Any authenticated site user may READ settings (needed by the editor).
  const raw = await settingsService.getGroup(auth.siteId, GROUP);
  return json(parseSettings(raw));
}

export async function PUT(req: Request): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return json({ error: "Unauthenticated" }, 401);
  if (!can(auth, "manage_settings").granted) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const result = gallerySettingsSchema.safeParse(body);
  if (!result.success) {
    return json({ error: "Invalid settings", issues: result.error.issues }, 400);
  }

  await settingsService.updateGroup(auth, {
    group: GROUP,
    values: {
      renderMode: result.data.renderMode,
      collections: result.data.collections,
    },
  });

  return json(result.data);
}
