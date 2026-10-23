import { z } from "zod";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure, permissionProcedure } from "../trpc";
import { prisma } from "@nextpress/db";
import { blockDataSchema } from "@nextpress/core/validation/schemas";

/**
 * Block templates are shared by every editor on a site, so changing them
 * needs the same right as editing other people's content. Every lookup is
 * scoped to the caller's site; ids alone are never trusted.
 */
const TEMPLATE_PERMISSION = "edit_others_content" as const;

async function assertTemplateInSite(siteId: string, id: string) {
  const t = await prisma.blockTemplate.findFirst({ where: { id, siteId }, select: { id: true } });
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Block template not found" });
}

export const blockTemplateRouter = router({
  list: authedProcedure
    .input(z.object({ category: z.string().optional(), mode: z.enum(["REUSABLE", "PATTERN"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return prisma.blockTemplate.findMany({
        where: {
          siteId: ctx.auth.siteId,
          ...(input?.category && { category: input.category }),
          ...(input?.mode && { mode: input.mode }),
        },
        orderBy: { title: "asc" },
      });
    }),
  getById: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      return prisma.blockTemplate.findFirst({ where: { id: input.id, siteId: ctx.auth.siteId } });
    }),
  create: permissionProcedure(TEMPLATE_PERMISSION)
    .input(z.object({
      slug: z.string().min(1).max(200),
      title: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      blocks: z.array(blockDataSchema),
      category: z.string().max(100).default("uncategorized"),
      mode: z.enum(["REUSABLE", "PATTERN"]).default("PATTERN"),
    }))
    .mutation(async ({ ctx, input }) => {
      return prisma.blockTemplate.create({
        data: { siteId: ctx.auth.siteId, ...input, blocks: input.blocks as unknown as Prisma.InputJsonValue },
      });
    }),
  update: permissionProcedure(TEMPLATE_PERMISSION)
    .input(z.object({
      id: z.string().cuid(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      blocks: z.array(blockDataSchema).optional(),
      category: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, blocks, ...rest } = input;
      await assertTemplateInSite(ctx.auth.siteId, id);
      return prisma.blockTemplate.update({
        where: { id },
        data: {
          ...rest,
          ...(blocks !== undefined && { blocks: blocks as unknown as Prisma.InputJsonValue }),
        },
      });
    }),
  delete: permissionProcedure(TEMPLATE_PERMISSION)
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertTemplateInSite(ctx.auth.siteId, input.id);
      await prisma.blockTemplate.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
