import {
  parseSettings,
  gallerySettingsSchema,
  type GallerySettings,
} from "../lib/collections";

/**
 * Settings + collections API handlers.
 *
 * These run inside the plugin sandbox with a bound `ctx.settings` accessor
 * (site-scoped). The plugin never touches Prisma directly — reads and writes
 * go through the settings service via the injected accessor, preserving the
 * multi-tenant boundary. Media is never stored here; collections only hold
 * references (mediaId + serialized variants) to existing Media Library assets.
 */

export interface SettingsAccessor {
  get: () => Promise<Record<string, unknown>>;
  update: (values: Record<string, unknown>) => Promise<void>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/** GET /settings → the site's render mode + collections. */
export function createGetSettingsHandler(settings: SettingsAccessor) {
  return async (): Promise<Response> => {
    const parsed = parseSettings(await settings.get());
    return json(parsed);
  };
}

/** PUT /settings → replace the whole settings object (validated). */
export function createUpdateSettingsHandler(settings: SettingsAccessor) {
  return async (req: Request): Promise<Response> => {
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
    const next: GallerySettings = result.data;
    await settings.update({
      renderMode: next.renderMode,
      collections: next.collections,
    });
    return json(next);
  };
}
