# NextPress Plugin — API Reference

All contracts below are from `packages/core/src/plugin/`, `packages/core/src/hooks/`, and the shipped plugins. Cited with `file:line`.

## PluginDefinition

`packages/core/src/plugin/plugin-types.ts:49`:

```ts
interface PluginDefinition {
  slug: string;                                            // must match plugin.json slug + dir name
  onActivate: (ctx: PluginContext) => void | Promise<void>;
  onDeactivate?: (ctx: PluginContext) => void | Promise<void>;
  onUninstall?: (ctx: PluginContext) => void | Promise<void>;
}
```

Default-exported from `index.ts`. `onActivate` runs once per server startup for active plugins.

## PluginContext

`packages/core/src/plugin/plugin-context.ts:29` — `class PluginContext(slug: string, auth: AuthContext)`, public `readonly slug`.

### ctx.hooks (`:39`)

```ts
addAction<K>(hook: K, callback: (...args: HookArgs<K>) => void | Promise<void>, priority?: number): void
addFilter<K>(hook: K, callback: (...args: HookArgs<K>) => HookReturn<K> | Promise<HookReturn<K>>, priority?: number): void
```

`priority` default `10`; lower runs earlier. Filters must **return** the (possibly transformed) first argument.

### ctx.content (`:61`)

```ts
registerType(input: Omit<CreateContentTypeInput, "slug"> & { slug: string }): Promise<ContentTypeDto>
registerFields(contentTypeSlug: string, fields: CreateFieldDefinitionInput[]): Promise<...>
registerMetaField(field: CreateFieldDefinitionInput): Promise<...>
```

### ctx.blocks (`:83`)

```ts
register(definition: Omit<BlockDefinition, "source">): void   // source auto-set to plugin slug
unregister(type: string): void
```

### ctx.admin (`:100`)

```ts
registerPage(item: Omit<AdminMenuItem, "slug"> & { slug: string }): void
registerSidebarPanel(panel: Omit<SidebarPanel, "slug"> & { slug: string }): void
getPages(); getSidebarPanels();
```

### ctx.api (`:126`)

```ts
registerRoute(method: "GET"|"POST"|"PUT"|"DELETE", path: string, handler: (req: Request) => Promise<Response>): void
getRoutes();
```

Final URL is `/api/v1/plugins/${slug}${path}` (e.g. registering `"/submit"` in the `contact-form` plugin serves `/api/v1/plugins/contact-form/submit`).

### ctx.settings (`:149`) — site-scoped, stored under group `plugin:${slug}`

```ts
get(): Promise<Record<string, unknown>>
update(values: Record<string, unknown>): Promise<void>
```

### ctx.taxonomies (`:169`)

```ts
register(input: {
  slug: string; name: string; description?: string;
  hierarchical?: boolean; contentTypes: string[];
}): Promise<...>
```

## Input shapes

### CreateContentTypeInput (`content-type/content-type-types.ts:6`)

`slug, nameSingular, namePlural, description?, hierarchical=false, hasArchive=true, isPublic=true, menuIcon="file-text", menuPosition=20, supports[], settings={}`.

`supports` enum: `title | editor | excerpt | thumbnail | comments | revisions | custom-fields | page-attributes`.

### CreateFieldDefinitionInput (`fields/field-types.ts:51`)

`contentTypeId?, key (regex ^[a-z][a-z0-9_]*$), name, description?, fieldType, isRequired=false, defaultValue?, validation?, options?, group="custom-fields", sortOrder=0`.

**fieldType enum (15 types)** (`field-types.ts:5`): `TEXT, TEXTAREA, RICHTEXT, NUMBER, BOOLEAN, DATE, DATETIME, SELECT, MULTISELECT, MEDIA, RELATION, COLOR, URL, EMAIL, JSON`.

`validation` fields: `{ min, max, minLength, maxLength, precision, pattern, accept, maxFiles, contentType, maxItems }`.

### BlockDefinition (`packages/blocks/src/types.ts:60`, register omits `source`)

`type, title, description?, icon, category (text|media|layout|embed|widgets|theme|plugin), keywords?, attributesSchema (Zod), defaultAttributes, version, migrate?, allowsInnerBlocks, allowedInnerBlockTypes?, renderComponent (ComponentType|null)`. `renderComponent: null` = editor-only block. Increment `version` and provide `migrate(old, fromVersion)` on breaking attribute changes.

### AdminMenuItem (`hooks/hook-types.ts:92`)

`slug, label, href, icon?, parentSlug?, position?, capability?`.

### SidebarPanel (`hooks/hook-types.ts:102`)

`slug, title, icon?, component: () => Promise<{ default: React.ComponentType }>, contentTypes?, position?`.

## Hook events (full list)

Registry: `hooks/hook-types.ts:27` (`HookRegistry`). An event whose handler returns `void` is an **action**; one that returns a value is a **filter**.

### Actions

| Event | Args |
|---|---|
| `content:before_save` | `[entry: ContentSavePayload]` |
| `content:after_save` | `[entry: ContentEntryDto]` |
| `content:before_delete` | `[entryId: string, siteId: string]` |
| `content:after_delete` | `[entryId: string, siteId: string]` |
| `content:status_change` | `[entry: ContentEntryDto, oldStatus: string, newStatus: string]` |
| `content:published` | `[entry: ContentEntryDto]` |
| `user:registered` | `[userId: string, email: string]` |
| `user:login` | `[userId: string]` |
| `comment:submitted` | `[commentId: string, contentEntryId: string]` |
| `comment:approved` | `[commentId: string]` |
| `media:uploaded` | `[mediaId: string, siteId: string]` |

### Filters (args → return)

| Event | Args → Returns |
|---|---|
| `render:blocks` | `[blocks: BlockData[], entry: ContentEntryDto]` → `BlockData[]` |
| `render:meta_tags` | `[tags: Record<string,string>, entry: ContentEntryDto]` → `Record<string,string>` |
| `render:excerpt` | `[excerpt: string, entry: ContentEntryDto]` → `string` |
| `admin:menu_items` | `[items: AdminMenuItem[]]` → `AdminMenuItem[]` |
| `admin:editor_sidebar_panels` | `[panels: SidebarPanel[]]` → `SidebarPanel[]` |
| `api:response` | `[data: unknown, endpoint: string]` → `unknown` |

`ContentSavePayload` (`hook-types.ts:81`): `{ id?, title, slug, blocks: BlockData[], status, contentTypeSlug, siteId, authorId }`.

Plugins may declare **new** hook events by module-augmenting `HookRegistry`.

## plugin.json manifest

Schema: `plugin-types.ts:19` (`pluginManifestSchema`).

| Field | Type / default | Meaning |
|---|---|---|
| `name` | string (req) | display name |
| `slug` | `^[a-z0-9-]+$` (req) | unique id; must match `PluginDefinition.slug` + dir name |
| `version` | string (req) | stored on install |
| `description` | string? | — |
| `author` / `authorUrl` | string? / url? | — |
| `requires` | string? | min CMS version |
| `dependencies` | string[] = [] | plugin slugs that must be active first (topological activation order) |
| `permissions` | `{ slug, name, description?, group="plugin" }[]` = [] | upserted into DB on activate, deleted on uninstall |
| `settings` | `Record<string,unknown>` = {} | JSON Schema for plugin settings |
| `contentTypes` | string[] = [] | declared content types |
| `taxonomies` | string[] = [] | declared taxonomies |

## Real registration snippets

**Custom field + meta-tags filter (seo-toolkit)**

```ts
await ctx.content.registerFields(typeSlug, [
  { key: "_seo_title", name: "SEO Title", fieldType: "TEXT",
    group: "seo", sortOrder: 0, validation: { maxLength: 70 } },
]);

ctx.hooks.addFilter("render:meta_tags", async (tags, entry) => {
  return { ...tags, description: (entry.fields._seo_description as string) ?? tags.description };
}, 5); // priority 5 — runs before default priority-10 handlers

ctx.admin.registerSidebarPanel({
  slug: "seo-inspector", title: "SEO", contentTypes: ["post", "page"],
  position: 100, component: () => import("./components/seo-sidebar"),
});
```

**Block + private content type + route + action (contact-form)**

```ts
ctx.blocks.register({
  type: "plugin/contact-form", title: "Contact Form", icon: "mail",
  category: "widgets", keywords: ["form", "contact", "email"],
  attributesSchema: contactFormSchema, defaultAttributes: { /* ... */ },
  version: 1, allowsInnerBlocks: false, renderComponent: null,
});

await ctx.content.registerType({
  slug: "form_submission", nameSingular: "Form Submission",
  namePlural: "Form Submissions", isPublic: false,
  menuIcon: "inbox", supports: ["title", "custom-fields"],
});

ctx.api.registerRoute("POST", "/submit", async (req) => {
  // served at /api/v1/plugins/contact-form/submit
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

ctx.hooks.addAction("content:after_save", async (entry) => { /* side effect */ });
```

**Settings-bound route + admin page (form-generator)**

```ts
ctx.api.registerRoute("POST", "/submit", createSubmitHandler({ getSettings, onSuccess }));
ctx.admin.registerPage({
  slug: "form-generator-settings", label: "Form Generator",
  href: "/admin/settings/form-generator", icon: "clipboard-list",
  capability: "manage_settings",
});
```

## Import paths

```ts
import type { PluginDefinition } from "@nextpress/core/plugin/plugin-types";
import type { PluginContext } from "@nextpress/core/plugin/plugin-context";
```

Block-related types (when registering blocks) come from `@nextpress/blocks`.

## Lifecycle (plugin-manager.ts)

`discover()` scans `plugins/*/plugin.json` (dirs starting `_` skipped) → `activate(slug, auth)` validates dependencies → dynamic `import(dir/index.ts)` → `new PluginContext(slug, auth)` → `onActivate` (on throw, `hooks.removeBySource(slug)` rolls back) → upserts permissions + `pluginInstall` row. `deactivate` calls `onDeactivate` then `hooks.removeBySource`. `uninstall` deactivates, calls `onUninstall`, deletes permissions + install row. `bootActivePlugins` topologically sorts by `dependencies` (Kahn's algorithm) at startup; missing dependencies prevent activation.
