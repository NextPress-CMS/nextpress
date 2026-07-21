---
name: nextpress-theme-development
description: Build, edit, or review NextPress CMS themes — layouts, the WordPress-style template hierarchy, block render overrides, theme.json manifests, and per-theme styling. Use when working anywhere under themes/{slug}/ in a NextPress repo, creating a new theme, changing how published content is presented, overriding a core block's render, or wiring theme customizations. Themes are presentation-only: they receive resolved content and render it, never touching Prisma, tRPC, or business logic.
---

# NextPress Theme Development

A NextPress theme is **layout + a WordPress-style template hierarchy + optional block render overrides + styling**. Themes are the lowest-risk track: sandboxed to one `themes/{slug}/` directory, they receive already-resolved content as plain data and render it with React Server Components. You never need Prisma, tRPC, or the permission engine to ship a theme.

## Golden rules

1. **Presentation only.** No DB access, no tRPC, no core service imports. Templates receive a `TemplateContext` and render it.
2. **Templates are synchronous server components.** Signature is `({ context }: TemplateProps)`. None are `async` — data is already resolved and passed in.
3. **`index.tsx` is the required fallback.** Every theme must provide `templates/index.tsx`. It is always the last candidate in resolution.
4. **Render blocks through `<BlockRenderer>`**, never by hand. Import from `@nextpress/blocks`.
5. **Sanitize any HTML** you inject with `DOMPurify.sanitize` and an explicit allowlist before `dangerouslySetInnerHTML` — follow the pattern in the existing block overrides.
6. **Theme is a startup singleton.** Switching or reloading a theme requires a dev-server restart/reset; it is not hot-swapped mid-request.

## Directory layout

```
themes/{slug}/
├── theme.json              # Manifest: name, slug, version, supports, settings schema, templateChoices
├── layout.tsx              # Root shell — default export ThemeLayout({ children, customizations })
├── templates/
│   ├── index.tsx           # REQUIRED fallback
│   ├── single.tsx          # any single entry
│   ├── single-{type}.tsx   # single entry of a specific content type
│   ├── page.tsx            # hierarchical content
│   ├── archive.tsx         # content listing
│   ├── home.tsx            # homepage
│   ├── search.tsx          # search results
│   ├── taxonomy.tsx        # taxonomy archive
│   └── 404.tsx             # not found
├── blocks/                 # optional per-block render overrides — filename maps to core/{filename}
│   └── paragraph.tsx       # overrides core/paragraph
├── components/             # theme-local components (header, footer, sidebar, ...)
└── styles/theme.css        # theme CSS (import it in layout.tsx if you rely on it)
```

## Workflow to create a theme

1. Copy `themes/_template/` to `themes/my-theme/`. Study `themes/default/` (simple, Tailwind-only) and `themes/twentytwentysix/` (richer, imports its own CSS, reads customizations) as worked references.
2. Edit `theme.json` — set `name`, `slug` (regex `^[a-z0-9-]+$`), `version`, `supports`, and the `settings` JSON-Schema (see [reference.md](reference.md)).
3. Write `layout.tsx` — default export `ThemeLayout({ children, customizations })`.
4. Start from `templates/index.tsx`, then add `single`, `page`, `archive`, `home`, `search`, `404` as needed.
5. Add block overrides in `blocks/` only if you need to restyle a core block's markup.
6. Add `styles/theme.css`; if the theme depends on it (not pure Tailwind utilities), `import "./styles/theme.css";` at the top of `layout.tsx`.

## The one mental model that matters: template resolution

The resolver picks the **most specific** template that exists, falling back to less specific ones, ending at `index`. Examples:

```
Single post "hello-world" with per-entry template "full-width":
  full-width → single-post-hello-world → single-post → single → index

Category "tech" archive:
  taxonomy-category-tech → taxonomy-category → taxonomy → archive → index

Homepage:
  front-page → home → index
```

You only need to provide the templates you actually want to specialize; everything else falls through to `index`. The full per-page-type candidate ordering, the exact `TemplateContext`/`TemplateEntry`/`BlockRenderProps` shapes, `theme.json` fields, block-override mechanics, styling wiring, and import paths are in **[reference.md](reference.md)** — load it before writing real template code.

## Common tasks → where to look in reference.md

- "What fields does my template get?" → `TemplateContext` and `TemplateEntry`.
- "Which template fires for this URL?" → the resolution hierarchy table.
- "Override how a core block looks" → block overrides + `BlockRenderProps`.
- "Add a per-entry template option to the editor sidebar" → `templateChoices` in `theme.json`.
- "Wire up dark mode / accent color / fonts" → `supports` + `settings` + `customizations`.
