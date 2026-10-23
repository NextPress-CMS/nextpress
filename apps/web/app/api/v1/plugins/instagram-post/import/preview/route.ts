/**
 * Import preview — read-only.
 *
 * Answers "what would an import actually do?" without writing anything, so an
 * admin can size the job before committing to it. The preview service never
 * calls a write method, which is what makes this safe to run repeatedly.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import { INSTAGRAM_PERMISSIONS, isInstagramError } from "@nextpress/plugin-instagram-post";
import { connectionService, createImportService } from "@/lib/instagram/adapters";

const previewSchema = z.object({
  /** null = walk the whole account. Capped to keep one request bounded. */
  limit: z.number().int().min(1).max(500).nullable().default(25),
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
    // Defaults are fine.
  }

  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
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
    const preview = await createImportService(token, settings).preview(
      auth.siteId,
      // "All available" still walks in pages; the ceiling protects the request.
      parsed.data.limit ?? 500,
    );

    return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isInstagramError(error) && error.category === "auth") {
      await connectionService.markNeedsReauth(auth, error.userMessage);
      return NextResponse.json({ error: error.userMessage }, { status: 409 });
    }

    return NextResponse.json(
      { error: isInstagramError(error) ? error.userMessage : "The preview could not be generated." },
      { status: 502 },
    );
  }
}
