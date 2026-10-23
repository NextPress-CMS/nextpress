import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@nextpress/db";
import { router, authedProcedure, permissionProcedure, publicProcedure } from "../trpc";
import { taxonomyService } from "@nextpress/core/taxonomy/taxonomy-service";
import { createTaxonomySchema, createTermSchema, updateTermSchema } from "@nextpress/core/taxonomy/taxonomy-types";

/**
 * Term operations take raw ids, so the service alone cannot tell whether a
 * term or taxonomy belongs to the caller's site. These guards keep one site's
 * admin from reading or editing another site's terms.
 */
async function assertTaxonomyInSite(siteId: string, taxonomyId: string) {
  const t = await prisma.taxonomy.findFirst({ where: { id: taxonomyId, siteId }, select: { id: true } });
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Taxonomy not found" });
}

async function assertTermInSite(siteId: string, termId: string) {
  const t = await prisma.term.findFirst({ where: { id: termId, taxonomy: { siteId } }, select: { id: true } });
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Term not found" });
}

export const taxonomyRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return taxonomyService.list(ctx.auth.siteId);
  }),
  getBySlug: publicProcedure
    .input(z.object({ siteId: z.string().cuid(), slug: z.string() }))
    .query(async ({ input }) => taxonomyService.getBySlug(input.siteId, input.slug)),
  create: permissionProcedure("manage_taxonomies")
    .input(createTaxonomySchema)
    .mutation(async ({ ctx, input }) => taxonomyService.create(ctx.auth, input)),
  delete: permissionProcedure("manage_taxonomies")
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => { await taxonomyService.delete(ctx.auth, input.id); return { success: true }; }),
  listTerms: authedProcedure
    .input(z.object({ taxonomyId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      await assertTaxonomyInSite(ctx.auth.siteId, input.taxonomyId);
      return taxonomyService.listTerms(input.taxonomyId);
    }),
  createTerm: permissionProcedure("manage_categories")
    .input(createTermSchema)
    .mutation(async ({ ctx, input }) => {
      await assertTaxonomyInSite(ctx.auth.siteId, input.taxonomyId);
      if (input.parentId) await assertTermInSite(ctx.auth.siteId, input.parentId);
      return taxonomyService.createTerm(ctx.auth, input);
    }),
  updateTerm: permissionProcedure("manage_categories")
    .input(z.object({ id: z.string().cuid(), data: updateTermSchema }))
    .mutation(async ({ ctx, input }) => {
      await assertTermInSite(ctx.auth.siteId, input.id);
      if (input.data.parentId) {
        await assertTermInSite(ctx.auth.siteId, input.data.parentId);
        // Walk up from the new parent; reaching this term means a cycle.
        let cursor: string | null = input.data.parentId;
        for (let depth = 0; cursor && depth < 100; depth++) {
          if (cursor === input.id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "A term cannot be placed under itself or its descendants" });
          }
          const next: { parentId: string | null } | null = await prisma.term.findUnique({ where: { id: cursor }, select: { parentId: true } });
          cursor = next?.parentId ?? null;
        }
      }
      return taxonomyService.updateTerm(ctx.auth, input.id, input.data);
    }),
  deleteTerm: permissionProcedure("manage_categories")
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertTermInSite(ctx.auth.siteId, input.id);
      await taxonomyService.deleteTerm(ctx.auth, input.id);
      return { success: true };
    }),
});
