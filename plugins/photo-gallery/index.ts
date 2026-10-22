import type { PluginDefinition } from "@nextpress/core/plugin/plugin-types";
import type { PluginContext } from "@nextpress/core/plugin/plugin-context";
import PhotoGalleryDispatch from "./components/gallery-dispatch";
import {
  photoGallerySchema,
  photoGalleryDefaults,
  PHOTO_GALLERY_VERSION,
  PHOTO_GALLERY_BLOCK_TYPE,
} from "./lib/schema";
import {
  createGetSettingsHandler,
  createUpdateSettingsHandler,
} from "./api/settings-handler";

export {
  photoGallerySchema,
  photoGalleryDefaults,
  PHOTO_GALLERY_VERSION,
  PHOTO_GALLERY_BLOCK_TYPE,
} from "./lib/schema";
export type {
  PhotoGalleryAttributes,
  GalleryImage,
  GalleryLayout,
  GalleryRenderMode,
  GalleryRenderChoice,
} from "./lib/schema";
export {
  gallerySettingsSchema,
  gallerySettingsDefaults,
  parseSettings,
  findCollection,
  resolveRenderMode,
  createCollection,
  upsertCollection,
  removeCollection,
  setCollectionImages,
} from "./lib/collections";
export type { Collection, GallerySettings } from "./lib/collections";

/**
 * Photo Gallery plugin.
 *
 * Registers the server-safe gallery render block through PluginContext, plus
 * settings/collections REST endpoints and an admin settings page. The client
 * edit component is registered separately via ./register-editor.ts (the plugin
 * API does not carry editor UI).
 *
 * The plugin owns NO media of its own — it references assets from the existing
 * NextPress Media Library. Collections are reusable, named reference sets
 * stored in the plugin's site-scoped settings (no new database table).
 */
const photoGalleryPlugin: PluginDefinition = {
  slug: "photo-gallery",

  async onActivate(ctx: PluginContext) {
    ctx.blocks.register({
      type: PHOTO_GALLERY_BLOCK_TYPE,
      title: "Photo Gallery",
      description:
        "A responsive gallery with adaptive mosaic, masonry, grid, and showcase layouts plus an immersive lightbox.",
      icon: "images",
      category: "media",
      keywords: ["gallery", "photos", "images", "grid", "mosaic", "masonry"],
      attributesSchema: photoGallerySchema,
      defaultAttributes: photoGalleryDefaults,
      version: PHOTO_GALLERY_VERSION,
      allowsInnerBlocks: false,
      renderComponent: PhotoGalleryDispatch,
    });

    // Settings + collections API (site-scoped via ctx.settings).
    //   GET /api/v1/plugins/photo-gallery/settings
    //   PUT /api/v1/plugins/photo-gallery/settings
    //
    // NOTE: NextPress does not yet ship a dispatcher that mounts plugin routes,
    // and plugin handlers receive only a Request (no auth context) — so writes
    // cannot be permission-gated here. For that reason the host app also ships a
    // dedicated, `manage_settings`-gated Next.js route at the same path
    // (apps/web/app/api/v1/plugins/photo-gallery/settings/route.ts) which is the
    // one actually served today. These registrations remain for standalone use
    // and a future generic plugin-route dispatcher.
    ctx.api.registerRoute("GET", "/settings", createGetSettingsHandler(ctx.settings));
    ctx.api.registerRoute("PUT", "/settings", createUpdateSettingsHandler(ctx.settings));

    // Admin settings page: render-mode default + collection management.
    ctx.admin.registerPage({
      slug: "photo-gallery-settings",
      label: "Photo Gallery",
      href: "/admin/settings/photo-gallery",
      icon: "images",
      capability: "manage_settings",
    });
  },

  async onDeactivate(ctx: PluginContext) {
    ctx.blocks.unregister(PHOTO_GALLERY_BLOCK_TYPE);
  },
};

export default photoGalleryPlugin;
