import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@nextpress/db";
import { router, authedProcedure } from "../trpc";
import { revisionService } from "@nextpress/core/revision/revision-service";
import { compareRevisions } from "@nextpress/core/revision/revision-diff";

/**
 * The revision service works on raw ids. Every procedure first proves the
 * entry (or the revision's entry) belongs to the caller's site.
 */
async function assertEntryInSite(siteId: string, contentEntryId: string) {
  const e = await prisma.contentEntry.findFirst({ where: { id: contentEntryId, siteId }, select: { id: true } });
  if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Content entry not found" });
}

async function getRevisionInSite(siteId: string, revisionId: string) {
  const revision = await revisionService.getById(revisionId);
  await assertEntryInSite(siteId, revision.contentEntryId);
  return revision;
}

export const revisionRouter = router({
  /** List revisions for a content entry */
  list: authedProcedure
    .input(z.object({ contentEntryId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      await assertEntryInSite(ctx.auth.siteId, input.contentEntryId);
      return revisionService.list(input.contentEntryId);
    }),

  /** Get a single revision */
  getById: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => getRevisionInSite(ctx.auth.siteId, input.id)),

  /** Compare two revisions (diff) */
  compare: authedProcedure
    .input(
      z.object({
        olderRevisionId: z.string().cuid(),
        newerRevisionId: z.string().cuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const older = await getRevisionInSite(ctx.auth.siteId, input.olderRevisionId);
      const newer = await getRevisionInSite(ctx.auth.siteId, input.newerRevisionId);
      return compareRevisions(older, newer);
    }),

  /** Get diff between a revision and the one before it */
  diff: authedProcedure
    .input(z.object({ revisionId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const revision = await getRevisionInSite(ctx.auth.siteId, input.revisionId);
      const allRevisions = await revisionService.list(revision.contentEntryId);

      // Find the revision immediately before this one
      const currentIdx = allRevisions.findIndex((r) => r.id === input.revisionId);
      if (currentIdx < 0 || currentIdx >= allRevisions.length - 1) {
        // First revision or not found — no diff available
        return {
          fromVersion: 0,
          toVersion: revision.version,
          fromDate: revision.createdAt,
          toDate: revision.createdAt,
          fromAuthor: revision.author,
          toAuthor: revision.author,
          changes: [
            { field: "title", label: "Title", type: "added" as const, before: null, after: revision.title },
            { field: "blocks", label: "Content", type: "added" as const, before: null, after: `${revision.blocks.length} blocks` },
          ],
          summary: "Initial version",
        };
      }

      const older = allRevisions[currentIdx + 1]!; // list is newest-first
      return compareRevisions(older, revision);
    }),

  /** Restore a revision */
  restore: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const revision = await getRevisionInSite(ctx.auth.siteId, input.id);
      // Restoring rewrites the entry, so it needs the same right as editing it.
      const entry = await prisma.contentEntry.findUnique({
        where: { id: revision.contentEntryId },
        select: { authorId: true },
      });
      const canEdit =
        ctx.auth.permissions.has("edit_others_content") ||
        (entry?.authorId === ctx.auth.user.id && ctx.auth.permissions.has("edit_own_content"));
      if (!canEdit) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot edit this entry" });
      }
      return revisionService.restore(input.id, ctx.auth.user.id);
    }),
});
