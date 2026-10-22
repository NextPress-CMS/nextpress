/**
 * Re-synchronise a single archived post.
 *
 * Used by the Retry action on a failed import. It refreshes the existing entry
 * rather than creating a new one — the media-id lookup guarantees that.
 */

import { NextResponse } from "next/server";
import { prisma } from "@nextpress/db";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import {
  IG_FIELDS,
  INSTAGRAM_PERMISSIONS,
  isInstagramError,
} from "@nextpress/plugin-instagram-post";
import { connectionService, createImportService } from "@/lib/instagram/adapters";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.import).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  // Resolve the entry's Instagram media id, scoped to this site.
  const mediaIdValue = await prisma.fieldValue.findFirst({
    where: {
      contentEntry: { id, siteId: auth.siteId },
      fieldDefinition: { key: IG_FIELDS.mediaId, siteId: auth.siteId },
    },
    select: { value: true },
  });

  const mediaId = typeof mediaIdValue?.value === "string" ? mediaIdValue.value : null;
  if (!mediaId) {
    return NextResponse.json(
      { error: "This entry is not linked to an Instagram post." },
      { status: 404 },
    );
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
    const result = await createImportService(token, settings).resyncOne(auth, mediaId);

    return NextResponse.json(
      { status: result.outcome, instagramMediaId: result.instagramMediaId, error: result.error },
      { status: result.outcome === "failed" ? 502 : 200 },
    );
  } catch (error) {
    if (isInstagramError(error) && error.category === "auth") {
      await connectionService.markNeedsReauth(auth, error.userMessage);
      return NextResponse.json({ error: error.userMessage }, { status: 409 });
    }

    return NextResponse.json(
      { error: isInstagramError(error) ? error.userMessage : "The re-sync could not be completed." },
      { status: 502 },
    );
  }
}
