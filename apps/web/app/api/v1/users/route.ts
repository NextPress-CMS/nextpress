/**
 * REST API: Users on the current site
 * GET  /api/v1/users   List users (requires list_users). ?page, per_page, search
 * POST /api/v1/users   Create a user (requires create_users)
 *
 * Delegates to the tRPC user router so permission checks and privilege
 * escalation rules are identical to the admin UI.
 */

import {
  jsonResponse, paginatedResponse, handleCmsError, handleOptions,
  requireRestAuth, parsePagination,
} from "@/lib/api/rest-helpers";
import { getServerCaller } from "@/lib/trpc/server";

export async function GET(req: Request) {
  try {
    await requireRestAuth();
    const url = new URL(req.url);
    const { page, perPage } = parsePagination(url);
    const caller = await getServerCaller();
    const result = await caller.user.list({
      page,
      perPage,
      search: url.searchParams.get("search") || undefined,
    });
    return paginatedResponse(result.users, {
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      totalPages: result.totalPages,
    });
  } catch (e) {
    return handleCmsError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireRestAuth();
    const body = await req.json();
    const caller = await getServerCaller();
    const user = await caller.user.create(body);
    return jsonResponse(user, 201);
  } catch (e) {
    return handleCmsError(e);
  }
}

export function OPTIONS(req: Request) { return handleOptions(req); }
