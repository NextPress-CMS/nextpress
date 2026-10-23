import { z } from "zod";
import {
  router,
  authedProcedure,
  permissionProcedure,
  publicProcedure,
} from "../trpc";
import { contentService } from "@nextpress/core/content/content-service";
import { reviewWorkflow } from "@nextpress/core/content/review-workflow";
import { prisma } from "@nextpress/db";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { canEditContent } from "@nextpress/core/auth/permissions";
import { blockDataSchema } from "@nextpress/core/validation/schemas";
import {
  createContentEntrySchema,
  updateContentEntrySchema,
  listContentEntriesSchema,
  statusTransitionSchema,
  type ContentEntryDto,
} from "@nextpress/core/content/content-types";

/**
 * Revalidation callback — injected by the app layer, NOT imported.
 *
 * The packages/api layer must not import from apps/web. Instead, the
 * app layer registers a callback when creating the tRPC handler.
 * This keeps the dependency arrow: apps/web → packages/api (never reverse).
 *
 * If no callback is registered (e.g., in tests), revalidation is a no-op.
 */
let onEntryChange: ((entry: ContentEntryDto) => void) | null = null;
let onEntryDelete: ((siteId: string, typeSlug: string) => void) | null = null;

export function setRevalidationCallbacks(callbacks: {
  onEntryChange: (entry: ContentEntryDto) => void;
  onEntryDelete: (siteId: string, typeSlug: string) => void;
}) {
  onEntryChange = callbacks.onEntryChange;
  onEntryDelete = callbacks.onEntryDelete;
}

function revalidateEntry(entry: ContentEntryDto) {
  onEntryChange?.(entry);
}

function revalidateDeletion(siteId: string, typeSlug: string) {
  onEntryDelete?.(siteId, typeSlug);
}

export const contentRouter = router({
  // ── Public read operations ──

  /** Get a single published entry by slug (public site) */
  getBySlug: publicProcedure
    .input(
      z.object({
        siteId: z.string().cuid(),
        contentTypeSlug: z.string(),
        slug: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return contentService.getBySlug(
        input.siteId,
        input.contentTypeSlug,
        input.slug,
      );
    }),

  // ── Authenticated CRUD ──

  /** Get a single entry by ID (admin) */
  getById: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      return contentService.getById(ctx.auth.siteId, input.id);
    }),

  /** List entries with filtering and pagination */
  list: authedProcedure
    .input(listContentEntriesSchema)
    .query(async ({ ctx, input }) => {
      return contentService.list(ctx.auth.siteId, input);
    }),

  /** Create a new content entry */
  create: authedProcedure
    .input(createContentEntrySchema)
    .mutation(async ({ ctx, input }) => {
      const entry = await contentService.create(ctx.auth, input);
      if (entry.status === "PUBLISHED") await revalidateEntry(entry);
      return entry;
    }),

  /** Update an existing content entry (creates revision) */
  update: authedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        data: updateContentEntrySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await contentService.update(ctx.auth, input.id, input.data);
      if (entry.status === "PUBLISHED") await revalidateEntry(entry);
      return entry;
    }),

  /**
   * Autosave — lightweight save that does NOT create a revision.
   *
   * The problem: if autosave fires every 30 seconds and each save
   * creates a revision, you get 120 revisions per hour of editing.
   * That's noise, not history.
   *
   * Solution: autosave writes directly to the content entry (title,
   * blocks) without calling revisionService.create(). A real revision
   * is only created on explicit "Save Draft", "Publish", or "Update".
   */
  autosave: authedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        title: z.string().max(500).optional(),
        // Same validation as an explicit save; autosave must not be a way to
        // store malformed blocks.
        blocks: z.array(blockDataSchema).optional(),
        excerpt: z.string().max(5000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await prisma.contentEntry.findFirst({
        where: { id: input.id, siteId: ctx.auth.siteId },
        select: { id: true, authorId: true },
      });
      if (!entry) return { success: false };
      if (!canEditContent(ctx.auth, entry.authorId).granted) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot edit this entry" });
      }

      await prisma.contentEntry.update({
        where: { id: input.id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.blocks !== undefined && { blocks: input.blocks as unknown as Prisma.InputJsonValue }),
          ...(input.excerpt !== undefined && { excerpt: input.excerpt }),
        },
      });

      return { success: true, savedAt: new Date() };
    }),

  /** Save as draft (convenience — DOES create revision) */
  saveDraft: authedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        data: updateContentEntrySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return contentService.saveDraft(ctx.auth, input.id, input.data);
    }),

  /** Transition status */
  transition: authedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        ...statusTransitionSchema.shape,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return contentService.transition(ctx.auth, input.id, {
        status: input.status,
        scheduledAt: input.scheduledAt,
      });
    }),

  /** Publish */
  publish: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await contentService.publish(ctx.auth, input.id);
      await revalidateEntry(entry);
      return entry;
    }),

  /** Schedule */
  schedule: authedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        scheduledAt: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return contentService.schedule(ctx.auth, input.id, input.scheduledAt);
    }),

  /** Archive */
  archive: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      return contentService.archive(ctx.auth, input.id);
    }),

  /** Move to trash */
  trash: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await contentService.trash(ctx.auth, input.id);
      await revalidateEntry(entry); // remove from public pages
      return entry;
    }),

  /** Restore from trash */
  restore: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      return contentService.restore(ctx.auth, input.id);
    }),

  /** Permanent delete (only from TRASH) */
  delete: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get entry info before deletion for revalidation
      const entry = await contentService.getById(ctx.auth.siteId, input.id);
      await contentService.delete(ctx.auth, input.id);
      await revalidateDeletion(ctx.auth.siteId, entry.contentType.slug);
      return { success: true };
    }),

  // ── Review workflow ──

  /** Submit for review (DRAFT → PENDING_REVIEW) */
  submitForReview: authedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return reviewWorkflow.submitForReview(ctx.auth, input.id, input.note);
    }),

  /** Approve review (PENDING_REVIEW → PUBLISHED) */
  approveReview: authedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await reviewWorkflow.approve(ctx.auth, input.id, input.note);
      await revalidateEntry(entry); // now published → appears on public site
      return entry;
    }),

  /** Request changes (PENDING_REVIEW → DRAFT + note) */
  requestChanges: authedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        note: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return reviewWorkflow.requestChanges(ctx.auth, input.id, input.note);
    }),

  /** Get review status for an entry */
  reviewStatus: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      return reviewWorkflow.getReviewStatus(ctx.auth.siteId, input.id);
    }),
});
