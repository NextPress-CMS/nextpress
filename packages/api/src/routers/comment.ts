import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  authedProcedure,
  permissionProcedure,
} from "../trpc";
import { commentService } from "@nextpress/core/comment/comment-service";
import {
  submitCommentSchema,
  listCommentsSchema,
  commentStatusSchema,
} from "@nextpress/core/comment/comment-types";

export const commentRouter = router({
  /** Public: get approved comments for a content entry */
  getForEntry: publicProcedure
    .input(z.object({ contentEntryId: z.string().cuid() }))
    .query(async ({ input }) => {
      return commentService.getForEntry(input.contentEntryId);
    }),

  /** Public: submit a comment (auth optional — guests allowed) */
  submit: publicProcedure
    .input(submitCommentSchema)
    .mutation(async ({ ctx, input }) => {
      // tRPC context carries a site only for signed-in users. Guests (the
      // public comment form) use POST /api/v1/comments, which resolves the
      // site from the request host.
      const siteId = ctx.auth?.siteId;
      if (!siteId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Guest comments must be posted to /api/v1/comments" });
      }
      return commentService.submit(siteId, input, ctx.auth ?? null);
    }),

  /** Admin: list comments with filtering */
  list: permissionProcedure("moderate_comments")
    .input(listCommentsSchema)
    .query(async ({ ctx, input }) => {
      return commentService.list(ctx.auth.siteId, input);
    }),

  /** Admin: moderate a single comment */
  moderate: permissionProcedure("moderate_comments")
    .input(z.object({
      id: z.string().cuid(),
      status: commentStatusSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      return commentService.moderate(ctx.auth, input.id, input.status);
    }),

  /** Admin: bulk moderate */
  moderateBulk: permissionProcedure("moderate_comments")
    .input(z.object({
      ids: z.array(z.string().cuid()).min(1),
      status: commentStatusSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const count = await commentService.moderateBulk(ctx.auth, input.ids, input.status);
      return { updated: count };
    }),

  /** Admin: permanent delete */
  delete: permissionProcedure("moderate_comments")
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await commentService.delete(ctx.auth, input.id);
      return { success: true };
    }),

  /** Admin: count by status (dashboard) */
  countByStatus: permissionProcedure("moderate_comments")
    .query(async ({ ctx }) => {
      return commentService.countByStatus(ctx.auth.siteId);
    }),
});
