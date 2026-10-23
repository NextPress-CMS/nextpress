/**
 * REST API: Revisions of a content entry (authenticated)
 * GET  /api/v1/content/{type}/{id}/revisions   List revisions, newest first
 * POST /api/v1/content/{type}/{id}/revisions   Restore one: { "revisionId": "..." }
 */

import {
  jsonResponse, errorResponse, handleCmsError, handleOptions, requireRestAuth,
} from "@/lib/api/rest-helpers";
import { contentService } from "@nextpress/core/content/content-service";
import { getServerCaller } from "@/lib/trpc/server";
import type { AuthContext } from "@nextpress/core/auth/auth-types";

/** The entry must exist on the caller's site and match the {type} segment. */
async function loadEntry(auth: AuthContext, type: string, id: string) {
  const entry = await contentService.getById(auth.siteId, id);
  return entry.contentType.slug === type ? entry : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const { type, id } = await params;
    const auth = await requireRestAuth();
    if (!(await loadEntry(auth, type, id))) return errorResponse("NOT_FOUND", "Content entry not found", 404);

    const caller = await getServerCaller();
    const revisions = await caller.revision.list({ contentEntryId: id });
    return jsonResponse(revisions);
  } catch (e) {
    return handleCmsError(e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const { type, id } = await params;
    const auth = await requireRestAuth();
    if (!(await loadEntry(auth, type, id))) return errorResponse("NOT_FOUND", "Content entry not found", 404);

    // Edit-permission and site checks live in the revision router.
    const body = (await req.json().catch(() => ({}))) as { revisionId?: unknown };
    if (typeof body.revisionId !== "string") {
      return errorResponse("BAD_REQUEST", "Body must include revisionId", 400);
    }

    const caller = await getServerCaller();
    const revision = await caller.revision.getById({ id: body.revisionId });
    if (revision.contentEntryId !== id) {
      return errorResponse("NOT_FOUND", "Revision not found for this entry", 404);
    }
    const result = await caller.revision.restore({ id: body.revisionId });
    return jsonResponse(result);
  } catch (e) {
    return handleCmsError(e);
  }
}

export function OPTIONS(req: Request) { return handleOptions(req); }
