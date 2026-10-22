/**
 * NextPress plugin API dispatcher — DROP-IN for the host app.
 *
 * Copy this file to:
 *   apps/web/app/api/v1/plugins/[...slug]/route.ts
 *
 * WHY THIS EXISTS
 * ---------------
 * Plugins register API routes through `ctx.api.registerRoute(method, path, handler)`,
 * which stores them at `/api/v1/plugins/<slug><path>` and exposes them via
 * `ctx.api.getRoutes()`. NextPress core stores these routes but does not yet
 * ship a catch-all Next.js handler that serves them. This dispatcher is that
 * missing piece: it resolves the active plugin contexts, matches the incoming
 * request's method + path against the registered routes, and invokes the
 * handler.
 *
 * It is intentionally generic — it serves EVERY active plugin's routes, not
 * just Form Generator — so you only ever add it once.
 *
 * ADAPT THE IMPORT BELOW: `getActivePluginContexts()` should return the array
 * of live `PluginContext` instances from your plugin manager. Wire it to
 * whatever your `pluginManager` exposes (e.g. `pluginManager.getContexts()`).
 */

import { NextRequest } from "next/server";
// import { getActivePluginContexts } from "@nextpress/core/plugin/plugin-manager";

type RegisteredRoute = {
  method: string;
  path: string;
  handler: (req: Request) => Promise<Response>;
};

// Replace this stub with your plugin manager's real accessor.
async function getActivePluginContexts(): Promise<
  Array<{ api: { getRoutes: () => RegisteredRoute[] } }>
> {
  // return getActivePluginContexts();
  return [];
}

async function dispatch(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname; // e.g. /api/v1/plugins/form-generator/submit

  const contexts = await getActivePluginContexts();
  for (const ctx of contexts) {
    for (const route of ctx.api.getRoutes()) {
      if (route.method === req.method && route.path === pathname) {
        return route.handler(req);
      }
    }
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: NextRequest) {
  return dispatch(req);
}
export async function POST(req: NextRequest) {
  return dispatch(req);
}
export async function PUT(req: NextRequest) {
  return dispatch(req);
}
export async function DELETE(req: NextRequest) {
  return dispatch(req);
}
