/**
 * REST API: Terms of a taxonomy
 * GET  /api/v1/taxonomies/{slug}/terms   Term tree (public for public taxonomies;
 *                                        private ones need an authenticated session)
 * POST /api/v1/taxonomies/{slug}/terms   Create a term (requires manage_categories)
 */

import {
  jsonResponse, errorResponse, handleCmsError, handleOptions,
  requireRestAuth, optionalRestAuth,
} from "@/lib/api/rest-helpers";
import { taxonomyService } from "@nextpress/core/taxonomy/taxonomy-service";
import { getServerCaller } from "@/lib/trpc/server";
import { headers } from "next/headers";
import { resolveSite } from "@/lib/site/resolve";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const h = await headers();
    const site = await resolveSite(h);
    if (!site) return errorResponse("SITE_NOT_FOUND", "Site not found", 404);

    const taxonomy = await taxonomyService.getBySlug(site.id, slug);
    if (!taxonomy.isPublic) {
      const auth = await optionalRestAuth();
      // Same 404 as a missing taxonomy, so private slugs are not discoverable.
      if (!auth || auth.siteId !== site.id) throw Object.assign(new Error(`Taxonomy "${slug}" not found`), { code: "NOT_FOUND", statusCode: 404 });
    }

    const terms = await taxonomyService.listTerms(taxonomy.id);
    return jsonResponse(terms);
  } catch (e) {
    return handleCmsError(e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const auth = await requireRestAuth();
    const taxonomy = await taxonomyService.getBySlug(auth.siteId, slug);
    const body = await req.json();
    const caller = await getServerCaller();
    const term = await caller.taxonomy.createTerm({ ...body, taxonomyId: taxonomy.id });
    return jsonResponse(term, 201);
  } catch (e) {
    return handleCmsError(e);
  }
}

export function OPTIONS(req: Request) { return handleOptions(req); }
