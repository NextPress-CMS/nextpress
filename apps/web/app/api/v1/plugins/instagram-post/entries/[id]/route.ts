/**
 * Per-entry Instagram publishing state, for the editor sidebar panel.
 *
 * GET returns the panel's view model; PUT saves publishing intent and caption.
 * Both are permission-gated server-side — the panel is presentation only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@nextpress/db";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import {
  CAPTION_MAX_LENGTH,
  IG_FIELDS,
  INSTAGRAM_PERMISSIONS,
} from "@nextpress/plugin-instagram-post";
import { connectionService, publishStore } from "@/lib/instagram/adapters";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  caption: z.string().max(CAPTION_MAX_LENGTH).optional(),
});

async function buildPanelState(siteId: string, entryId: string) {
  const [connection, entry, fields] = await Promise.all([
    connectionService.getPublicConnection(siteId),
    publishStore.getPublishableEntry(siteId, entryId),
    readInstagramFields(siteId, entryId),
  ]);

  return {
    enabled: fields[IG_FIELDS.publishEnabled] === true,
    caption: (fields[IG_FIELDS.publishCaption] as string | undefined) ?? entry?.caption ?? "",
    publishStatus: (fields[IG_FIELDS.publishStatus] as string | undefined) ?? "NOT_PUBLISHED",
    instagramMediaId: fields[IG_FIELDS.publishMediaId] as string | undefined,
    error: fields[IG_FIELDS.publishError] as string | undefined,
    retryCount: Number(fields[IG_FIELDS.publishRetryCount] ?? 0),
    connected: connection.status === "connected",
    connectionMessage:
      connection.status === "needs_reauth"
        ? "The Instagram connection requires attention. Reconnect the account."
        : undefined,
  };
}

async function readInstagramFields(
  siteId: string,
  entryId: string,
): Promise<Record<string, unknown>> {
  const values = await prisma.fieldValue.findMany({
    // siteId on both sides keeps a stray id from crossing tenants.
    where: { contentEntry: { id: entryId, siteId }, fieldDefinition: { siteId } },
    select: { value: true, fieldDefinition: { select: { key: true } } },
  });
  return Object.fromEntries(values.map((v) => [v.fieldDefinition.key, v.value]));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.read).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  return NextResponse.json(await buildPanelState(auth.siteId, id), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.publish).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // An already-published entry is frozen: changing the caption here would
  // imply an Instagram edit the API does not support.
  const existing = await publishStore.getPublishableEntry(auth.siteId, id);
  if (existing?.publishStatus === "PUBLISHED") {
    return NextResponse.json(await buildPanelState(auth.siteId, id), { status: 409 });
  }

  const fields: Record<string, unknown> = {};
  if (parsed.data.enabled !== undefined) fields[IG_FIELDS.publishEnabled] = parsed.data.enabled;
  if (parsed.data.caption !== undefined) fields[IG_FIELDS.publishCaption] = parsed.data.caption;

  if (Object.keys(fields).length > 0) {
    await publishStore.updatePublishState(auth, id, fields);
  }

  return NextResponse.json(await buildPanelState(auth.siteId, id));
}
