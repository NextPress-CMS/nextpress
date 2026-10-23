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
  /**
   * The active theme plus its settings schema (JSON-Schema-like, from
   * theme.json) and saved customizations, for the customizer screen.
   */
  getActiveSettings: permissionProcedure("customize_theme").query(async ({ ctx }) => {
    const install = await prisma.themeInstall.findFirst({ where: { siteId: ctx.auth.siteId, isActive: true } });
    const slug = install?.slug ?? "default";
    const discovered = themeManager.getDiscovered().find((d) => d.slug === slug);
    return {
      slug,
      name: discovered?.manifest.name ?? slug,
      hasInstall: !!install,
      settings: (discovered?.manifest.settings ?? {}) as Record<string, unknown>,
      customizations: (install?.customizations ?? {}) as Record<string, unknown>,
    };
  }),
  getCustomizations: authedProcedure.query(async ({ ctx }) => {
    const install = await prisma.themeInstall.findFirst({ where: { siteId: ctx.auth.siteId, isActive: true } });
    return (install?.customizations ?? {}) as Record<string, unknown>;
  }),
  updateCustomizations: permissionProcedure("customize_theme")
    .input(z.object({ customizations: z.record(z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const customizations = input.customizations as unknown as Prisma.InputJsonValue;
      const updated = await prisma.themeInstall.updateMany({ where: { siteId: ctx.auth.siteId, isActive: true }, data: { customizations } });
      // A fresh site renders the "default" theme without an install row; create
      // it so customizations are not silently dropped.
      if (updated.count === 0) {
        await prisma.themeInstall.upsert({
          where: { siteId_slug: { siteId: ctx.auth.siteId, slug: "default" } },
          update: { isActive: true, customizations },
          create: { siteId: ctx.auth.siteId, slug: "default", version: "1.0.0", isActive: true, activatedAt: new Date(), customizations },
        });
      }
      themeManager.reset();
      return { success: true };
    }),
});
