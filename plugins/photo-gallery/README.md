# @nextpress/plugin-photo-gallery

A premium, responsive **Photo Gallery** block for [NextPress](https://github.com/NextPress-CMS/nextpress) — adaptive mosaic, masonry, grid, and showcase layouts with an immersive, accessible lightbox. The photography is the interface.

## Features

- **Reuses the NextPress Media Library** — the plugin ships **no media section of its own**. Every image is a reference (`mediaId` + serialized variants) to an existing Media Library asset, selected through the standard media picker.
- **Reusable Collections** — create a named collection in the plugin settings page, add Media Library images to it, then select that collection inside any gallery block. Collections live in the plugin's site-scoped settings store — **no new database table**.
- **Admin render-mode control** — a user-friendly settings page lets an admin choose the site-wide default render mode (**server-side** for best SEO / no-JS, or **client-side** for interactivity). Each gallery block can override it.
- **Four layouts** — Adaptive Mosaic (editorial), Masonry (mixed ratios), Classic Grid (2/3/4/auto columns, selectable aspect ratios), and Filmstrip/Showcase.
- **Immersive lightbox** — dialog semantics, keyboard (Esc / ← / →), touch swipe, focus trap + restore, scroll-lock without layout shift, preloads only current ± 1.
- **Responsive images** — builds `srcset`/`sizes` from the media library's generated variants; preserves intrinsic `width`/`height` to avoid layout shift. No runtime database access.
- **Editor experience** — strong empty state, Media Library selection, collection picker, drag + keyboard reorder, per-image caption/alt, opinionated appearance controls.
- **Accessible & progressive** — real SSR HTML with alt text and captions that works without JavaScript; the lightbox is a pure enhancement. Respects `prefers-reduced-motion`.
- **Theme-agnostic** — scoped `.np-pg` styles driven by CSS variables; leaks nothing globally.

## Collections & render mode

- **Settings page:** `/admin/settings/photo-gallery` (registered via `ctx.admin.registerPage`, guarded by `manage_settings`). Set the default render mode and manage collections there.
- **Settings API:** `GET`/`PUT` `/api/v1/plugins/photo-gallery/settings`. Served by a host route (`install/settings.route.example.ts` → copy to `apps/web/app/api/v1/plugins/photo-gallery/settings/route.ts`) that reads/writes the site-scoped settings store and **gates writes on `manage_settings`**. Returns `{ renderMode, collections }`. (The plugin also self-registers these routes via `ctx.api` for a future generic dispatcher.)
- **In a block:** pick a collection as the image *Source*, or keep an ad-hoc block-local set. Choosing a collection copies its images into the block as a DB-free render snapshot. Set *Rendering* to Site default / Server-side / Client-side per block.

## Architecture

| Concern | Where |
|---|---|
| Server render (SSR block) | `components/gallery-render.tsx` → registered via `PluginContext.blocks.register` in `index.ts` |
| Client lightbox | `components/gallery-lightbox*.tsx` (progressive enhancement) |
| Editor edit component | `components/gallery-editor.tsx` → registered via `register-editor.ts` |
| Schema (source of truth) | `lib/schema.ts` (Zod) |
| Pure helpers | `lib/media.ts`, `lib/layouts.ts` |
| Media picker injection | `lib/media-picker-bridge.ts` (host app injects its picker — keeps the plugin free of app internals) |

The plugin stores everything the renderer needs inside `BlockData.attributes` (image URLs, variants, dimensions, alt, captions), so the public render path never queries the database — mirroring and extending the core image block's DB-free convention. No new database tables.

### Editor bridge

The NextPress `PluginContext` only registers the server render side of a block. To deliver the client edit component, the host app imports `@nextpress/plugin-photo-gallery/register-editor` and injects its Media Library picker via `setMediaPicker(...)`. See `apps/web/lib/plugins/photo-gallery-editor.ts` in the host repo.

## Installation (within a NextPress monorepo)

1. Place this package at `plugins/photo-gallery/`.
2. Add `@nextpress/plugin-photo-gallery` as a workspace dependency of `apps/web`.
3. Wire the editor bridge once (client side):

   ```ts
   import { setMediaPicker } from "@nextpress/plugin-photo-gallery/media-picker-bridge";
   import { registerPhotoGalleryEditor } from "@nextpress/plugin-photo-gallery/register-editor";
   import { MediaPicker } from "@/components/admin/media/media-picker";

   setMediaPicker(MediaPicker);
   registerPhotoGalleryEditor();
   ```

4. Ensure the app's Tailwind `content` globs include `plugins/**`.
5. Activate the plugin through the NextPress plugin manager.

## Block attributes

See `lib/schema.ts`. Highlights: `images[]`, `layout`, `columns`, `gap`, `radius`, `aspectRatio`, `lightbox`, `showCaptions`, `captionMode`, `showImageCount`, `hoverEffect`. Opinionated defaults — a gallery looks excellent with zero configuration.

## Testing

```bash
pnpm --filter @nextpress/plugin-photo-gallery exec tsc --noEmit   # types
pnpm --filter @nextpress/plugin-photo-gallery exec vitest run     # 37 unit + integration tests
```

E2E (from the host app): `apps/web/__tests__/e2e/photo-gallery.spec.ts` (Playwright).

## License

MIT
