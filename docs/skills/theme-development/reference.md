# NextPress Theme — API Reference

All shapes below are the real contracts from `packages/core/src/theme/` and `packages/blocks/src/`. Cited with `file:line`.

## theme.json (ThemeManifest)

Schema: `packages/core/src/theme/theme-types.ts:22` (`themeManifestSchema`).

| Field | Type | Default / rule |
|---|---|---|
| `name` | string (min 1) | required |
| `slug` | string, regex `^[a-z0-9-]+$` | required |
| `version` | string | required |
| `description` | string | optional |
| `author` | string | optional |
| `authorUrl` | string (url) | optional |
| `screenshot` | string | optional |
| `supports.menuLocations` | string[] | `["primary","footer"]` |
| `supports.widgetAreas` | string[] | `[]` |
| `supports.customColors` | boolean | `true` |
| `supports.darkMode` | boolean | `false` |
| `settings` | JSON-Schema object | `{}` |
| `templates` | string[] | `[]` (auto-discovered from `templates/`) |
| `templateChoices` | `{ slug, name, description?, contentTypes: string[] }[]` | `[]` |

`settings` is a JSON-Schema `type:"object"` with `properties`, each having `type`, optional `enum`, `default`. Real keys in shipped themes: `accentColor`, `fontFamily`, `showSidebar`, `postsPerPage`, `footerText` (default), plus `layout`, `sidebarPosition`, `showExcerpts`, `excerptLength`, `showAuthorBio`, `showRelatedPosts`, `showReadingTime`, `showShareButtons`, `darkMode` (twentytwentysix). These resolved values arrive at runtime as `context.customizations` / `customizations`.

`templateChoices[].slug` values (e.g. `full-width`, `sidebar-right`, `no-title`, `cover`) become the per-entry template override that the resolver checks first.

## Template resolution hierarchy

`packages/core/src/theme/template-resolver.ts`. `resolveTemplate(templates, ctx)` builds a candidate list via `buildHierarchy(ctx)` and returns the first template that exists; ultimate fallback is `"index"`.

`ResolveContext` fields: `pageType` (`"single" | "archive" | "taxonomy" | "search" | "404" | "home"`), `contentTypeSlug?`, `entrySlug?`, `entryTemplate?: string | null`, `isHierarchical?`, `taxonomySlug?`, `termSlug?`.

Candidate ordering per `pageType` (first match wins, `index` always appended last):

| pageType | candidate order |
|---|---|
| `single` | `entryTemplate?`, `single-{type}-{slug}`, (if hierarchical) `page-{slug}` then `page`, `single-{type}`, `single`, `index` |
| `archive` | `archive-{type}`, `archive`, `index` |
| `taxonomy` | `taxonomy-{tax}-{term}`, `taxonomy-{tax}`, `taxonomy`, `archive`, `index` |
| `search` | `search`, `archive`, `index` |
| `404` | `404`, `index` |
| `home` | `front-page`, `home`, `index` |

`getTemplateChoicesForType(themeChoices, contentTypeSlug)` builds the editor sidebar list: a blank "Default Template" option first, then choices whose `contentTypes` is empty or includes the type.

## Template props

`TemplateProps` = `{ context: TemplateContext }` (`theme-types.ts:90`). `TemplateComponent = ComponentType<TemplateProps>`. **Templates are synchronous (not async) function components.**

`TemplateContext` (`theme-types.ts:54`):

```ts
interface TemplateContext {
  entry: TemplateEntry | null;          // null for archive/search/404
  entries?: TemplateEntry[];
  pagination?: { page: number; totalPages: number; total: number };
  term?: { name: string; slug: string; taxonomy: string };
  searchQuery?: string;
  site: { name: string; tagline: string | null; url: string };
  customizations: Record<string, unknown>;
}
```

`TemplateEntry` (`theme-types.ts:72`):

```ts
interface TemplateEntry {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  blocks: BlockData[];
  status: string;
  contentType: { slug: string; nameSingular: string };
  author: { name: string | null; displayName: string | null; image: string | null };
  publishedAt: Date | null;
  createdAt: Date;
  template: string | null;              // per-entry override slug
  fields: Record<string, unknown>;      // custom field values, incl. _seo_* keys
  terms: Array<{ name: string; slug: string; taxonomy: { slug: string } }>;
  featuredImage: { url: string; alt: string | null; width: number | null; height: number | null } | null;
}
```

### Layout props

`LoadedTheme.layout` = `ComponentType<{ children: React.ReactNode; customizations: Record<string, unknown> }>` (`theme-types.ts:136`). Both shipped themes implement exactly:

```ts
interface Props { children: React.ReactNode; customizations: Record<string, unknown>; }
export default function ThemeLayout({ children, customizations }: Props) { /* ... */ }
```

The manager accepts `default` or a named `ThemeLayout` export; if neither, it wraps children in a passthrough.

### Template body patterns (from shipped themes)

- `single.tsx` / `page.tsx`: destructure `{ entry }` from `context`, early-return `null` if falsy, render `<BlockRenderer blocks={entry.blocks} />`.
- `archive.tsx`: use `{ entries = [], pagination }`; twentytwentysix also reads `term`, `customizations`.
- `home.tsx` / `search.tsx`: re-render the archive template with spread props, reading `context.site` / `context.searchQuery`.
- `index.tsx` can simply delegate to `HomeTemplate`.
- Reading customizations: `context.customizations.showSidebar`, `...showAuthorBio`, `...showShareButtons`, and branching on `entry.template === "cover" | "full-width"`.

## Block render overrides

`BlockRenderProps` (`packages/blocks/src/types.ts:107`):

```ts
interface BlockRenderProps<TAttributes = Record<string, unknown>> {
  attributes: TAttributes;
  children?: React.ReactNode;
  className?: string;
  blockData: BlockData;                 // { id, type, attributes, innerBlocks }
}
```

**How overrides register:** the theme manager auto-loads every `.tsx` in the theme's `blocks/` dir, maps filename → block type `core/{filename}`, and calls `overrideRenderComponent("core/{filename}", component)` (`theme-manager.ts:157`). So `blocks/paragraph.tsx` overrides `core/paragraph`, `blocks/heading.tsx` overrides `core/heading`. `overrideRenderComponent(type, component)` (`registry.ts:57`) replaces **only** `renderComponent` on the already-registered base block — the base block must exist.

Override component signature (typed example, `themes/default/blocks/paragraph.tsx:9`):

```ts
import type { BlockRenderProps } from "@nextpress/blocks";
import type { ParagraphAttributes } from "@nextpress/blocks/blocks/paragraph";

export default function ThemedParagraph({ attributes, className }: BlockRenderProps<ParagraphAttributes>) {
  // sanitize before injecting HTML — see rule below
}
```

**Renderer behavior** (`renderer.tsx`): `<BlockRenderer blocks={...} className={...} />` wraps in `<div className={className ?? "np-blocks"}>`, and per block runs `migrateBlockAttributes` → `validateBlockAttributes` (Zod) before rendering `<Component attributes={validated} blockData={block} className={"np-block np-block-<type-with-dash>"} />`. Inner blocks recurse only when the block's `allowsInnerBlocks` is true. Blocks with `renderComponent: null` are skipped.

**Sanitization rule:** all shipped overrides sanitize `attributes.content` with `DOMPurify.sanitize(content, { ALLOWED_TAGS: [...], ALLOWED_ATTR: [...] })` before `dangerouslySetInnerHTML`. Always follow this — never inject raw HTML.

## Import paths

```ts
import { BlockRenderer } from "@nextpress/blocks";
import type { BlockRenderProps } from "@nextpress/blocks";
import type { ParagraphAttributes } from "@nextpress/blocks/blocks/paragraph";
import type { TemplateProps } from "@nextpress/core/theme/theme-types";
```

Local relative imports for theme components: `./components/header`, `./components/footer`, `../components/sidebar`, etc.

## Styling wiring

- CSS lives at `themes/{slug}/styles/theme.css`; the manager records its path when present.
- **twentytwentysix** imports it directly: `import "./styles/theme.css";` at the top of `layout.tsx` — the reliable way to guarantee the CSS loads.
- **default** uses Tailwind utilities inline and scopes its CSS rules under a root class (`np-theme-default`) rather than importing.
- The layout sets a root wrapper class (e.g. `np-theme-default`, or `np-twentytwentysix np-font-{font} np-dark?`) derived from `customizations.fontFamily` / `customizations.darkMode`.
- Blocks receive `np-block np-block-core-{type}` from the renderer; theme overrides can append their own classes (e.g. `np-drop-cap`).

## Loader conventions (theme-manager.ts)

- Active theme resolved from the `themes/` dir; directories starting with `_` are ignored (so `_template` never loads).
- Template slug = filename minus `.tsx`; component = `mod.default` or the first export.
- Layout = `mod.default || mod.ThemeLayout`, else an internal passthrough.
- Block override type = `core/{filename}`.
- Theme loads once at startup (singleton) — restart the dev server to pick up a theme switch.
