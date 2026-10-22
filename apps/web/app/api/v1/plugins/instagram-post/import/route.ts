/**
 * Historical import — one resumable batch per request.
 *
 * Batching is what makes a large account importable at all: each request stays
 * well inside gateway timeouts, and the returned cursor lets the caller resume
 * exactly where it stopped. Because every item is keyed on its Instagram media
 * id, re-running any batch is a no-op rather than a duplicate.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import { INSTAGRAM_PERMISSIONS, isInstagramError } from "@nextpress/plugin-instagram-post";
import { connectionService, createImportService } from "@/lib/instagram/adapters";

const importRequestSchema = z.object({
  /** Items per request. Capped so a single call cannot run unbounded. */
  batchSize: z.number().int().min(1).max(25).default(10),
  cursor: z.string().optional(),
  /** Re-import known posts to refresh captions edited on Instagram. */
  refreshExisting: z.boolean().default(false),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.import).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body means "use the defaults" — not an error.
  }

  const parsed = importRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const token = await connectionService.getUsableToken(auth);
  if (!token) {
    return NextResponse.json(
      { error: "The Instagram connection requires attention. Reconnect the account." },
      { status: 409 },
    );
  }

  const settings = await connectionService.getSettings(auth.siteId);

  try {
    const result = await createImportService(token, settings).run(auth, {
      limit: parsed.data.batchSize,
      cursor: parsed.data.cursor,
      refreshExisting: parsed.data.refreshExisting,
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // An expired token surfaced mid-import must flip the connection state, or
    // the admin is left staring at a failure with no explanation.
    if (isInstagramError(error) && error.category === "auth") {
      await connectionService.markNeedsReauth(auth, error.userMessage);
      return NextResponse.json({ error: error.userMessage }, { status: 409 });
    }

    if (isInstagramError(error) && error.category === "rate_limit") {
      return NextResponse.json(
        { error: error.userMessage, retryAfterSeconds: error.retryAfterSeconds },
        { status: 429 },
      );
    }

    return NextResponse.json({ error: "The import could not be completed." }, { status: 500 });
  }
}
