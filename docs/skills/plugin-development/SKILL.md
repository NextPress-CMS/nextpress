---
name: nextpress-plugin-development
description: Build, edit, or review NextPress CMS plugins — content types, custom fields, block types, admin pages, editor sidebar panels, custom API routes, settings, taxonomies, and hook callbacks (actions + filters). Use when working anywhere under plugins/{slug}/ in a NextPress repo, creating a new plugin, or extending CMS behavior through PluginContext. Plugins never import Prisma or core internals directly — PluginContext is the entire sanctioned API surface.
---

# NextPress Plugin Development

A NextPress plugin extends CMS behavior through **one controlled object: `PluginContext`**. Plugins register content types, custom fields, block types, admin pages, sidebar panels, API routes, settings, taxonomies, and hook callbacks — all via `ctx.*`. They never touch Prisma or core internals directly; the context is the entire sanctioned surface, and every registration is source-tagged with the plugin slug for clean deactivation.

## Golden rules

1. **`PluginContext` is the only door.** No `import { prisma }`, no core service imports. Use `ctx.hooks`, `ctx.content`, `ctx.blocks`, `ctx.admin`, `ctx.api`, `ctx.settings`, `ctx.taxonomies`.
2. **A plugin is a default-exported `PluginDefinition`** in `index.ts` with `slug` + `onActivate(ctx)` (and optional `onDeactivate`/`onUninstall`). The `slug` MUST match `plugin.json` `slug` and the directory name.
3. **`onActivate` runs at server startup** for every active plugin. Do your registrations there.
4. **Hooks auto-remove on deactivate.** All `ctx.*` registrations are tagged by source; you rarely need manual cleanup. Use `onUninstall` only to remove persisted DB data.
5. **Actions vs filters.** Actions are side effects (return `void`). Filters transform and **return** the first argument. Pick the right kind for the hook.
6. **Zod is the source of truth** for block attributes and field validation.
7. **Directories starting with `_` are never loaded** (so `_template` is a scaffold, not an active plugin).
8. **`ctx.api` routes are auto-prefixed** to `/api/v1/plugins/{slug}{path}`.

## Directory layout

```
plugins/{slug}/
├── plugin.json             # Manifest: name, slug, version, dependencies, permissions, settings, contentTypes, taxonomies
├── index.ts                # default export PluginDefinition — onActivate(ctx) / onDeactivate / onUninstall
├── components/             # block edit/render components, admin panels, sidebar panels
├── api/                    # route handler functions used by ctx.api.registerRoute
└── lib/                    # plugin-local helpers
```

## Workflow to create a plugin

1. Copy `plugins/_template/` to `plugins/my-plugin/`. Set `slug` in both `plugin.json` and `index.ts` to match the directory.
2. Study the shipped plugins as end-to-end examples:
   - `plugins/seo-toolkit/` — custom fields + `render:meta_tags` filter + settings + sidebar panel.
   - `plugins/contact-form/` — custom block + private content type + `ctx.api` route + `content:after_save` action.
   - `plugins/form-generator/` — settings-bound route + admin pages.
   - (`plugins/analytics/` ships only components — its `index.ts` is empty, so it is not a `PluginDefinition` reference.)
3. Inside `onActivate(ctx)`, register only what you need. Await the async registrations (`ctx.content.*`, `ctx.taxonomies.*`, `ctx.settings.*`).
4. Declare dependencies, new permissions, and settings schema in `plugin.json`.

## The two imports every plugin uses

```ts
import type { PluginDefinition } from "@nextpress/core/plugin/plugin-types";
import type { PluginContext } from "@nextpress/core/plugin/plugin-context";

const myPlugin: PluginDefinition = {
  slug: "my-plugin",
  async onActivate(ctx: PluginContext) { /* register here */ },
  async onDeactivate(ctx) { /* optional */ },
  async onUninstall(ctx) { /* remove persisted data */ },
};
export default myPlugin;
```

## What you can register (quick map)

| Call | Purpose |
|---|---|
| `ctx.hooks.addAction(hook, cb, priority?)` | React to a lifecycle event (side effect) |
| `ctx.hooks.addFilter(hook, cb, priority?)` | Transform data flowing through the CMS |
| `ctx.content.registerType(input)` | Create a custom content type |
| `ctx.content.registerFields(typeSlug, fields)` | Add custom fields to a type |
| `ctx.content.registerMetaField(field)` | Add a global meta field |
| `ctx.blocks.register(def)` / `ctx.blocks.unregister(type)` | Add/remove a block type |
| `ctx.admin.registerPage(item)` | Add an admin nav item |
| `ctx.admin.registerSidebarPanel(panel)` | Add an editor sidebar panel |
| `ctx.api.registerRoute(method, path, handler)` | Add a REST endpoint under `/api/v1/plugins/{slug}` |
| `ctx.settings.get()` / `ctx.settings.update(values)` | Read/write plugin settings (site-scoped) |
| `ctx.taxonomies.register(input)` | Create a custom taxonomy |

The **exact signatures, input shapes, the full list of 17 hook events (actions vs filters) with their payload types, the `plugin.json` manifest fields, and real registration snippets** are in **[reference.md](reference.md)**. Load it before writing registration code — the hook names and input shapes are precise and easy to get wrong from memory.

## Common tasks → where to look in reference.md

- "React when a post is published / a comment is submitted" → hook events (actions) + `ctx.hooks.addAction`.
- "Change meta tags / excerpts / block list before render" → hook events (filters) + `ctx.hooks.addFilter`.
- "Add a custom field to posts" → `ctx.content.registerFields` + `CreateFieldDefinitionInput` + the 15 field types.
- "Register a new block" → `ctx.blocks.register` + `BlockDefinition` (Zod attributes, `version`, `migrate`).
- "Add a settings page / editor sidebar panel" → `ctx.admin.registerPage` / `registerSidebarPanel`.
- "Expose an API endpoint" → `ctx.api.registerRoute` (remember the `/api/v1/plugins/{slug}` prefix).
- "Declare a dependency on another plugin" → `plugin.json` `dependencies` (topological activation order).
