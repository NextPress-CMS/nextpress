/**
 * Instagram Posts — NextPress plugin.
 *
 *   Instagram → NextPress   import and archive historical posts locally
 *   NextPress → Instagram   publish content from the existing editor
 *
 * The local database and Media Library are the durable archive. The public
 * website renders entirely from local data and never calls Instagram at
 * request time — that is what keeps pages fast, cacheable, SEO-visible, and
 * unaffected by Instagram outages or API quotas.
 *
 * Everything is site-scoped through `siteId`, so one NextPress installation
 * can serve many sites, each with its own independent Instagram account.
 */

import type { PluginDefinition } from "@nextpress/core/plugin/plugin-types";
import type { PluginContext } from "@nextpress/core/plugin/plugin-context";
import { settingsService } from "@nextpress/core/settings/settings-service";

import { instagramArchiveBlock } from "./src/blocks/instagram-archive-block";
import { INSTAGRAM_CONTENT_TYPE, instagramContentTypeDefinition } from "./src/content/content-type";
import {
  ARCHIVE_FIELDS,
  IG_FIELDS,
  PUBLISHABLE_CONTENT_TYPES,
  PUBLISH_FIELDS,
  normalizeFields,
} from "./src/content/fields";
import { INSTAGRAM_SETTINGS_GROUP } from "./src/schemas/settings";
import { logger } from "./src/services/logger";

const instagramPost: PluginDefinition = {
  slug: "instagram-post",

  async onActivate(ctx: PluginContext) {
    // ── Content type for the archive ──
    //
    // Tolerant of re-activation: the type may already exist from a previous
    // activation, and that must not be treated as an error.
    try {
      await ctx.content.registerType(instagramContentTypeDefinition);
    } catch {
      // Already registered — expected on re-activation.
    }

    // ── Fields ──
    //
    // Archive fields describe imported posts. Publish fields are attached to
    // ordinary content types so the EXISTING editor gains Instagram publishing
    // rather than the plugin shipping a second editor.
    await ctx.content.registerFields(INSTAGRAM_CONTENT_TYPE, normalizeFields(ARCHIVE_FIELDS));

    for (const typeSlug of PUBLISHABLE_CONTENT_TYPES) {
      try {
        await ctx.content.registerFields(typeSlug, normalizeFields(PUBLISH_FIELDS));
      } catch {
        // A site may not define every default content type.
      }
    }

    // ── Settings group ──
    settingsService.registerGroup(INSTAGRAM_SETTINGS_GROUP);

    // ── Admin pages ──
    ctx.admin.registerPage({
      slug: "instagram",
      label: "Instagram",
      href: "/admin/plugins/instagram-post",
      icon: "instagram",
      position: 40,
      capability: "instagram_read",
    });

    ctx.admin.registerPage({
      slug: "instagram-import",
      label: "Import",
      href: "/admin/plugins/instagram-post/import",
      parentSlug: "instagram",
      capability: "instagram_import",
    });

    ctx.admin.registerPage({
      slug: "instagram-posts",
      label: "Archived Posts",
      href: "/admin/plugins/instagram-post/posts",
      parentSlug: "instagram",
      capability: "instagram_read",
    });

    ctx.admin.registerPage({
      slug: "instagram-settings",
      label: "Settings",
      href: "/admin/plugins/instagram-post/settings",
      parentSlug: "instagram",
      capability: "instagram_manage_settings",
    });

    // ── Editor sidebar panel ──
    //
    // Publishing lives inside the normal editing flow, next to every other
    // per-entry setting.
    ctx.admin.registerSidebarPanel({
      slug: "instagram-publish",
      title: "Instagram",
      contentTypes: [...PUBLISHABLE_CONTENT_TYPES],
      position: 90,
      component: () => import("./src/admin/publish-panel"),
    });

    // ── Public block ──
    //
    // Renders from local content only. It performs no Instagram request, so a
    // page using it stays fast and cacheable.
    ctx.blocks.register(instagramArchiveBlock);

    // ── Hooks ──
    //
    // Publishing follows the CMS lifecycle: a DRAFT is never sent to
    // Instagram. The actual API call is queued for the publish route rather
    // than performed inline, because a slow container upload must not block
    // the editor's save request.
    ctx.hooks.addAction("content:published", async (entry) => {
      if (entry.fields?.[IG_FIELDS.publishEnabled] !== true) return;
      if (entry.fields?.[IG_FIELDS.publishStatus] === "PUBLISHED") return;

      await settingsService
        .set(entry.siteId, INSTAGRAM_SETTINGS_GROUP.slug, `queue:${entry.id}`, {
          contentEntryId: entry.id,
          queuedAt: new Date().toISOString(),
        })
        .catch(() => {
          // Queueing is best-effort; an admin can still publish manually.
        });

      logger.info("instagram.publish.started", {
        siteId: entry.siteId,
        contentEntryId: entry.id,
        operation: "queued_by_hook",
      });
    });

    logger.info("instagram.connection.created", {
      operation: "plugin_activated",
      status: "ok",
    });
  },

  async onDeactivate(_ctx: PluginContext) {
    // Hooks and blocks are removed automatically by source tracking.
    // Archived content stays exactly where it is — it belongs to the website.
    logger.info("instagram.connection.disconnected", { operation: "plugin_deactivated" });
  },

  async onUninstall(ctx: PluginContext) {
    // Conservative on purpose: the credential is destroyed, the ARCHIVE IS NOT.
    // Deleting a site's Instagram history because a plugin was removed would
    // be destructive and irreversible; removal of that content stays an
    // explicit, user-initiated action.
    await ctx.settings.update({ connection: { status: "not_connected" } });

    logger.info("instagram.connection.disconnected", {
      operation: "plugin_uninstalled",
      status: "tokens_cleared_archive_preserved",
    });
  },
};

export default instagramPost;

// ── Public surface for host routes and tests ──

export * from "./src/api";
export * from "./src/services";
export * from "./src/content";
export * from "./src/schemas/settings";
export * from "./src/permissions";
