import { z } from "zod";
import { Prisma } from "@prisma/client";
import { router, authedProcedure, permissionProcedure } from "../trpc";
import { themeManager } from "@nextpress/core/theme/theme-manager";
import { prisma } from "@nextpress/db";

/**
 * Skin discovery is injected from the app layer because it reads from
 * apps/web/public/skins which is not accessible from the core package.
 */
let skinLister: (() => Array<{ slug: string; manifest: { name: string; version: string; description?: string; author?: string } }>) | null = null;

export function setSkinLister(lister: () => Array<{ slug: string; manifest: { name: string; version: string; description?: string; author?: string } }>) {
  skinLister = lister;
}

export const themeRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const discovered = themeManager.getDiscovered();
    const installs = await prisma.themeInstall.findMany({ where: { siteId: ctx.auth.siteId } });
    const installMap = new Map(installs.map((i) => [i.slug, i]));

    const builtIn = discovered.map((d) => ({
      slug: d.slug, name: d.manifest.name, version: d.manifest.version,
      description: d.manifest.description, author: d.manifest.author,
      isActive: installMap.get(d.slug)?.isActive ?? false,
      isSkin: false,
    }));

    const skins = (skinLister?.() ?? []).map((s) => ({
      slug: s.slug,
      name: s.manifest.name,
      version: s.manifest.version,
      description: s.manifest.description,
      author: s.manifest.author,
      isActive: installMap.get(s.slug)?.isActive ?? false,
      isSkin: true,
    }));

    // Dedupe (skin slug colliding with a built-in — unlikely, but be safe)
    const seen = new Set<string>();
    const merged = [...builtIn, ...skins].filter((t) => {
      if (seen.has(t.slug)) return false;
      seen.add(t.slug);
      return true;
    });

    return merged;
  }),
  activate: permissionProcedure("switch_themes")
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.themeInstall.updateMany({ where: { siteId: ctx.auth.siteId, isActive: true }, data: { isActive: false } });
      await prisma.themeInstall.upsert({
        where: { siteId_slug: { siteId: ctx.auth.siteId, slug: input.slug } },
        update: { isActive: true, activatedAt: new Date() },
        create: { siteId: ctx.auth.siteId, slug: input.slug, version: "1.0.0", isActive: true, activatedAt: new Date() },
      });
      themeManager.reset();
      return { success: true };
    }),
  getCustomizations: authedProcedure.query(async ({ ctx }) => {
    const install = await prisma.themeInstall.findFirst({ where: { siteId: ctx.auth.siteId, isActive: true } });
    return (install?.customizations ?? {}) as Record<string, unknown>;
  }),
  updateCustomizations: permissionProcedure("customize_theme")
    .input(z.object({ customizations: z.record(z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      await prisma.themeInstall.updateMany({ where: { siteId: ctx.auth.siteId, isActive: true }, data: { customizations: input.customizations as unknown as Prisma.InputJsonValue } });
      return { success: true };
    }),
});
