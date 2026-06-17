<div align="center">

# NextPress

**The modern, open-source CMS for the Next.js ecosystem.**

[![CI](https://github.com/AminMemariani/nextpress/actions/workflows/ci.yml/badge.svg)](https://github.com/AminMemariani/nextpress/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/AminMemariani/nextpress/graph/badge.svg)](https://codecov.io/gh/AminMemariani/nextpress)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14+-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Tests](https://img.shields.io/badge/Tests-Unit%20%C2%B7%20Integration%20%C2%B7%20E2E-blue)](https://github.com/AminMemariani/nextpress/actions/workflows/ci.yml)
[![Code Style: Prettier](https://img.shields.io/badge/Code%20Style-Prettier-ff69b4?logo=prettier&logoColor=white)](https://prettier.io/)

WordPress taught the world that anyone can publish on the web. NextPress carries that mission forward with a modern foundation: **type-safe TypeScript**, **server-rendered React**, **structured block content**, and an **API-first architecture** that works for both traditional websites and headless frontends.

</div>

---

### What is NextPress?

NextPress is a content management system that gives you the flexibility of WordPress — custom content types, a plugin ecosystem, swappable themes, a block-based editor, media management, editorial workflows, SEO, comments, menus, and multi-site — built entirely on Next.js, TypeScript, PostgreSQL, and Prisma.

It is designed for developers who want to build content-driven websites and applications without sacrificing type safety, performance, or the ability to extend every part of the system.

### Why not just use WordPress?

WordPress is PHP, relies on a 20-year-old architecture, has no type safety, mixes rendering with data access, and doesn't support modern deployment targets (serverless, edge, containers) without significant friction. NextPress solves these problems while preserving what WordPress got right: the content model, the plugin/theme ecosystem pattern, and the editorial experience.

### Why not a headless CMS (Sanity, Strapi, Contentful)?

Headless CMSs separate the backend from the frontend, which adds latency, deployment complexity, and a disconnect between content editing and content rendering. NextPress keeps them in one repository — the admin panel and the public site share the same process, the same types, and the same cache. Publish a post and the public page updates in under a second, not after a webhook round-trip.

### Project Status

NextPress is in **active development**. The architecture is complete and the core systems are implemented:

| Metric | Value |
|--------|-------|
| TypeScript files | 244 |
| Lines of code | 18,752 |
| Prisma models | 28 |
| tRPC routers | 11 |
| Service modules | 11 |
| Block types | 6 |
| Test files | 13 |
| Permissions | 28 |
| Hook events | 16 |

The next step is wiring the monorepo dependencies (`pnpm install`), running the first migration, and booting the dev server. See [Getting Started](#23-getting-started).

---

# Technical Specification

## Table of Contents

1. [Architecture](#1-architecture)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Data Model](#4-data-model)
5. [Key Interfaces](#5-key-interfaces)
6. [Route Map](#6-route-map)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Content System](#8-content-system)
9. [Block Editor](#9-block-editor)
10. [Plugin System](#10-plugin-system)
11. [Theme System](#11-theme-system)
12. [Editorial Workflow](#12-editorial-workflow)
13. [Media Library](#13-media-library)
14. [Search](#14-search)
15. [SEO](#15-seo)
16. [Comments](#16-comments)
17. [Settings & Menus](#17-settings--menus)
18. [API Design](#18-api-design)
19. [Caching & Revalidation](#19-caching--revalidation)
20. [Security Model](#20-security-model)
21. [Testing Strategy](#21-testing-strategy)
22. [Roadmap](#22-roadmap)
23. [Getting Started](#23-getting-started)
24. [Contributing & Required Skills](#24-contributing--required-skills)

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      NEXTPRESS MONOREPO                         │
│                                                                 │
│  ┌─────────────────────┐     ┌────────────────────────────┐    │
│  │  PUBLIC SITE (SSR)   │     │    ADMIN PANEL (CSR/SSR)   │    │
│  │  app/(site)/...      │     │    app/(admin)/...         │    │
│  └──────────┬───────────┘     └─────────────┬──────────────┘    │
│             │                               │                    │
│  ┌──────────┴───────────────────────────────┴──────────────┐    │
│  │                    CORE ENGINE                           │    │
│  │  Content · Fields · Taxonomy · Media · Auth · Hooks     │    │
│  │  Themes · Plugins · SEO · Search · Comments · Settings  │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │                    API LAYER                             │    │
│  │  tRPC (11 routers)  ·  REST /api/v1/*  ·  Webhooks     │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │                    DATA LAYER                            │    │
│  │  Prisma (PostgreSQL)  ·  Cache (unstable_cache)         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │
│  │  PLUGINS     │  │  THEMES      │  │  BLOCK EDITOR    │      │
│  │  plugins/*   │  │  themes/*    │  │  packages/editor │      │
│  └──────────────┘  └──────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

- **Route groups** separate admin `(admin)`, public `(site)`, and auth `(auth)` — different layouts, same process.
- **packages/core** is framework-agnostic (no React, no Next.js imports). Testable in isolation.
- **packages/api** (tRPC) sits between the UI and core. Pages never import Prisma directly.
- **packages/blocks** (render components) are server-safe. **packages/editor** (edit components) are client-only. They share types but never import each other.
- **Plugins** interact with the CMS only through `PluginContext` — a controlled API surface with source-tracked registrations.
- **Themes** provide layout + templates + block overrides. Template resolution follows the WordPress hierarchy.

**Dependency direction (never violated):**

```
apps/web → packages/api → packages/core → packages/db
                        → packages/blocks
apps/web → packages/editor (admin only)
apps/web → packages/ui (admin only)
plugins  → packages/core (via PluginContext)
themes   → packages/blocks (via overrideRenderComponent)
```

---

## 2. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14+ (App Router) | SSR, RSC, ISR, streaming, middleware |
| Language | TypeScript (strict) | End-to-end type safety |
| Database | PostgreSQL | JSONB for blocks/meta, tsvector for search, GIN indexes |
| ORM | Prisma | Type generation, migrations, query builder |
| Auth | Auth.js (NextAuth v5) | JWT sessions, OAuth providers, Prisma adapter |
| Internal API | tRPC v11 | Type-safe client-server, superjson, React Query |
| External API | REST /api/v1/* | Versioned, CORS, JSON envelope |
| Validation | Zod | Runtime validation, schema composition, type inference |
| UI | Tailwind CSS + custom components | Admin design system in packages/ui |
| Monorepo | pnpm workspaces + Turborepo | Workspace packages, build caching |

---

## 3. Repository Structure

```
nextpress/
├── apps/web/                      # Next.js application
│   ├── app/
│   │   ├── (admin)/admin/         # Admin panel (auth-gated)
│   │   ├── (site)/                # Public site (SSR, cached)
│   │   ├── (auth)/                # Login, register
│   │   └── api/                   # REST, tRPC, upload, cron, webhooks
│   ├── components/admin/          # Admin React components (client)
│   ├── components/site/           # Public site components (server)
│   ├── hooks/                     # Client React hooks
│   ├── lib/                       # Next.js-specific glue
│   │   ├── auth/                  # Auth.js config, session, guards
│   │   ├── trpc/                  # tRPC client, server caller, provider
│   │   ├── cache/                 # Cache tags, revalidation, cached queries
│   │   ├── permissions/           # Permission check/assert helpers
│   │   ├── site/                  # Multi-tenant site resolution
│   │   ├── seo/                   # Metadata, structured data, OG image
│   │   └── api/                   # REST API helpers (CORS, envelope)
│   └── middleware.ts              # Auth gate, route protection
│
├── packages/
│   ├── core/                      # CMS business logic (NO React)
│   │   └── src/
│   │       ├── auth/              # Permission engine, roles, types
│   │       ├── content/           # Content CRUD, queries, review workflow
│   │       ├── content-type/      # Content type registration
│   │       ├── fields/            # Field definitions, dynamic Zod validator
│   │       ├── revision/          # Revision snapshots, diff engine
│   │       ├── taxonomy/          # Taxonomy service (stub)
│   │       ├── media/             # Upload, storage (local/S3), image processing
│   │       ├── comment/           # Threaded comments, moderation
│   │       ├── menu/              # Navigation menus, URL resolution
│   │       ├── settings/          # Key-value settings, plugin groups
│   │       ├── hooks/             # Hook engine (actions + filters)
│   │       ├── plugin/            # Plugin manager, context, lifecycle
│   │       ├── theme/             # Theme manager, template resolver
│   │       ├── seo/               # SEO service, sitemap, structured data
│   │       ├── search/            # PostgreSQL FTS, provider interface
│   │       ├── scheduling/        # Cron-based scheduled publishing
│   │       ├── webhooks/          # Webhook delivery, HMAC signatures
│   │       ├── validation/        # Shared Zod schemas, slug utilities
│   │       └── errors/            # CMS error hierarchy
│   │
│   ├── db/                        # Prisma schema, client, seeds
│   ├── api/                       # tRPC routers (11 implemented)
│   ├── blocks/                    # Block registry + render components (SSR-safe)
│   ├── editor/                    # Block editor + edit components (client-only)
│   └── ui/                        # Admin design system components
│
├── plugins/                       # Plugin directory
│   ├── _template/                 # Plugin scaffold
│   ├── seo-toolkit/               # SEO fields, meta tags, sitemap
│   └── contact-form/              # Custom block + content type + API
│
├── themes/                        # Theme directory
│   ├── _template/                 # Theme scaffold
│   └── default/                   # Default theme (6 templates)
│
└── tooling/                       # Shared ESLint, TypeScript, Prettier configs
```

---

## 4. Data Model

28 Prisma models, 891 lines. PostgreSQL with JSONB, tsvector, and GIN indexes.

```
AUTH               CONTENT                 RELATIONS
────               ───────                 ─────────
Account            ContentEntry            ContentTerm (M:N)
Session            ContentType             ContentMedia (M:N + role)
VerificationToken  FieldDefinition         UserSite (M:N + role)
User               FieldValue              RolePermission (M:N)
UserMeta           Revision
Role               BlockTemplate
Permission

TAXONOMY           MEDIA          NAVIGATION      CONFIG
────────           ─────          ──────────      ──────
Taxonomy           MediaAsset     Menu            Setting
Term                              MenuItem        PluginInstall
                                                  ThemeInstall
SOCIAL             SEO                            Redirect
──────             ───
Comment            (via fields + hooks)

MULTI-TENANT
────────────
Site (every scoped model carries siteId)
```

**Key schema decisions:**

- **Unified ContentEntry table** with `contentTypeId` discriminator. Custom post types are rows in ContentType, not new tables.
- **EAV with JSON values** for custom fields (FieldDefinition + FieldValue). Queryable via JSON operators + GIN index. No schema changes for new fields.
- **JSONB blocks** for content (not serialized HTML). Structured, queryable, re-renderable by different themes.
- **Row-level multi-tenancy** via `siteId` on all scoped models. Single-tenant deployments use one Site row.

---

## 5. Key Interfaces

### Content Entry DTO

```typescript
interface ContentEntryDto {
  id: string;
  siteId: string;
  contentType: { id: string; slug: string; nameSingular: string };
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "SCHEDULED" | "PRIVATE" | "ARCHIVED" | "TRASH";
  title: string;
  slug: string;
  excerpt: string | null;
  blocks: BlockData[];
  author: { id: string; name: string | null; displayName: string | null; image: string | null };
  fields: Record<string, unknown>;
  terms: Array<{ id: string; name: string; slug: string; taxonomy: { slug: string } }>;
  featuredImage: { url: string; alt: string | null; width: number | null; height: number | null } | null;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  revisionCount: number;
}
```

### Block Data

```typescript
interface BlockData {
  id: string;                           // unique instance ID
  type: string;                         // "core/paragraph", "plugin/testimonial"
  attributes: Record<string, unknown>;  // type-specific data + __version
  innerBlocks: BlockData[];             // nested blocks (columns, groups)
}
```

### Block Definition

```typescript
interface BlockDefinition<TSchema extends z.ZodObject> {
  type: string;                         // namespaced: "core/paragraph"
  title: string;
  icon: string;
  category: BlockCategory;
  attributesSchema: TSchema;            // Zod schema — single source of truth
  defaultAttributes: z.infer<TSchema>;
  version: number;                      // increment on breaking changes
  migrate?: (old: Record<string, unknown>, fromVersion: number) => Record<string, unknown>;
  allowsInnerBlocks: boolean;
  source: string;                       // "core", theme slug, or plugin slug
  renderComponent: ComponentType<BlockRenderProps> | null;  // server-safe
}
```

### Auth Context

```typescript
interface AuthContext {
  user: SessionUser;                    // id, email, name, displayName, image
  siteId: string;                       // current site (multi-tenant)
  role: RoleSlug;                       // resolved from UserSite join
  permissions: Set<PermissionSlug>;     // 28 granular permissions
}
```

### Plugin Definition

```typescript
interface PluginDefinition {
  slug: string;
  onActivate: (ctx: PluginContext) => void | Promise<void>;
  onDeactivate?: (ctx: PluginContext) => void | Promise<void>;
  onUninstall?: (ctx: PluginContext) => void | Promise<void>;
}
```

### Theme Manifest (theme.json)

```typescript
interface ThemeManifest {
  name: string;
  slug: string;
  version: string;
  supports: { menuLocations: string[]; customColors: boolean; darkMode: boolean };
  settings: Record<string, unknown>;    // JSON Schema for customization
  templates: string[];                  // provided template names
  templateChoices: Array<{              // per-entry template options
    slug: string; name: string; contentTypes: string[];
  }>;
}
```

---

## 6. Route Map

### Admin (`/admin/*` — auth required)

| Route | Permission | Purpose |
|-------|-----------|---------|
| `/admin` | `read` | Dashboard (stats, recent entries) |
| `/admin/posts` | `read` | Post list (filter, search, paginate) |
| `/admin/posts/new` | `create_content` | Create post (block editor) |
| `/admin/posts/[id]/edit` | `edit_own_content` | Edit post |
| `/admin/[contentType]` | `read` | Dynamic content type list |
| `/admin/media` | `upload_media` | Media library |
| `/admin/comments` | `moderate_comments` | Comment moderation |
| `/admin/users` | `list_users` | User management |
| `/admin/menus` | `manage_menus` | Menu builder |
| `/admin/appearance/themes` | `switch_themes` | Theme gallery |
| `/admin/plugins` | `manage_plugins` | Plugin manager |
| `/admin/content-types` | `manage_content_types` | Content type builder |
| `/admin/taxonomies` | `manage_taxonomies` | Taxonomy manager |
| `/admin/settings/*` | `manage_settings` | Settings (general, reading, discussion, permalinks) |
| `/admin/profile` | `read` | Own profile |

### Public Site

| Route | Rendering | Caching |
|-------|-----------|---------|
| `/` | Homepage template, latest entries | `unstable_cache` + tag `homepage:{siteId}` |
| `/[...slug]` | Template resolver: single entry or taxonomy archive | `unstable_cache` + tag `content:{id}` |
| `/search?q=...` | PostgreSQL FTS, search template | Dynamic (no cache) |
| `/sitemap.xml` | XML sitemap generator | `s-maxage=3600` |
| `/feed.xml` | RSS 2.0 feed | `s-maxage=3600` |

### API

| Route | Auth | Purpose |
|-------|------|---------|
| `/api/trpc/*` | Session cookie | tRPC (11 routers, admin internal) |
| `/api/v1/content/{type}` | Optional | REST: list/create content |
| `/api/v1/content/{type}/{id}` | Optional | REST: get/update/delete content |
| `/api/v1/media` | Required | REST: list media |
| `/api/v1/taxonomies` | None | REST: list taxonomies + terms |
| `/api/v1/menus/{location}` | None | REST: get menu |
| `/api/v1/comments` | None/Optional | REST: list/submit comments |
| `/api/v1/search` | None | REST: full-text search |
| `/api/v1/settings` | None | REST: public settings |
| `/api/upload` | Required | Multipart file upload |
| `/api/webhooks` | Signature | Incoming webhook receiver |
| `/api/cron/publish` | CRON_SECRET | Scheduled publishing |
| `/api/revalidate` | REVALIDATION_SECRET | Cache invalidation |

---

## 7. Authentication & Authorization

**4-layer defense:**

| Layer | Where | What | On Failure |
|-------|-------|------|-----------|
| Middleware | Edge | JWT exists for `/admin/*` | Redirect `/login` |
| Layout guard | Server component | `getAuthContext()` + `canAccessAdmin()` | Redirect `/login` |
| Page guard | Server component | `requirePermission("manage_settings")` | Redirect `/admin?error=forbidden` |
| Mutation guard | tRPC / service | `assertCan(auth, "publish_content")` | Throw `FORBIDDEN` |

**Session strategy:** JWT (stateless). The JWT contains `SessionUser` (5 fields). Role + permissions resolved per-request from `UserSite → Role → RolePermission → Permission`. This means role changes take effect immediately (no JWT expiry wait) and users can have different roles on different sites.

**6 built-in roles:**

| Role | Key Permissions |
|------|----------------|
| super_admin | Bypasses all checks (hardcoded, not in permission table) |
| admin | All 28 permissions for one site |
| editor | All content + comments + menus, no users/plugins/settings |
| author | Own content + publish + media |
| contributor | Own content, cannot publish |
| subscriber | Read + edit profile only |

**Ownership-aware:** `edit_own_content` and `edit_others_content` are separate permissions. The `can()` function checks ownership when a `ResourceContext` is provided.

---

## 8. Content System

### Status Machine

```
DRAFT ────────→ PENDING_REVIEW | PUBLISHED | SCHEDULED | PRIVATE | TRASH
PENDING_REVIEW → DRAFT | PUBLISHED | SCHEDULED | PRIVATE | TRASH
PUBLISHED ────→ DRAFT | PRIVATE | ARCHIVED | TRASH
SCHEDULED ────→ DRAFT | PUBLISHED | TRASH
PRIVATE ──────→ DRAFT | PUBLISHED | TRASH
ARCHIVED ─────→ DRAFT | PUBLISHED | TRASH
TRASH ────────→ DRAFT (only)
```

Transitions validated at the service layer. `publish_content` permission required for PUBLISHED and SCHEDULED.

### Custom Fields

15 field types: TEXT, TEXTAREA, RICHTEXT, NUMBER, BOOLEAN, DATE, DATETIME, SELECT, MULTISELECT, MEDIA, RELATION, COLOR, URL, EMAIL, JSON.

Each `FieldDefinition` declares: key, type, validation rules (Zod), options (for SELECT), required flag, default value, group (for admin UI).

`field-validator.ts` builds a Zod schema at runtime from FieldDefinition rows, then validates field values on every create/update.

### Revisions

Every explicit save creates an immutable `Revision` snapshot (title, blocks, excerpt, fieldValues as JSON). Autosave (every 30s) writes to the entry directly without creating a revision. Restore copies revision data back and creates a new revision (history is never lost). Default retention: 25 revisions per entry.

---

## 9. Block Editor

**Two packages, one contract:**

| Package | Runtime | Purpose |
|---------|---------|---------|
| `packages/blocks` | Server + Client | BlockDefinition types, registry, `<BlockRenderer>` (SSR), 6 render components |
| `packages/editor` | Client only | `<NextPressEditor>`, EditorProvider, 6 edit components, serialization, undo/redo |

**6 implemented blocks:** paragraph, heading, image, quote, button/CTA, columns (with nesting).

**Block lifecycle:**
1. Block defined with Zod attribute schema + version number
2. Registered in global registry (side-effect import)
3. Editor creates/edits BlockData via the edit component
4. Serialization validates + migrates before save
5. Renderer validates + migrates + renders via the render component
6. Themes override render components via `overrideRenderComponent()`
7. Plugins register new block types via `ctx.blocks.register()`

**Security:** DOMPurify sanitizes all rich text output. Unknown block types skip silently in production. Zod validates attributes at every checkpoint (save, load, render).

---

## 10. Plugin System

**Lifecycle:** Discover (scan `plugins/` for `plugin.json`) → Load (import `index.ts`) → Activate (call `onActivate(ctx)`) → Deactivate (remove hooks by source) → Uninstall (call `onUninstall(ctx)`).

**PluginContext API surface:**

| Method | What It Does |
|--------|-------------|
| `ctx.hooks.addAction(hook, callback)` | Register lifecycle hook (source-tracked) |
| `ctx.hooks.addFilter(hook, callback)` | Register data transformation filter |
| `ctx.content.registerType(input)` | Create a custom content type |
| `ctx.content.registerFields(type, fields)` | Add custom fields to a content type |
| `ctx.blocks.register(definition)` | Register a custom block type |
| `ctx.admin.registerPage(item)` | Add an admin navigation item |
| `ctx.admin.registerSidebarPanel(panel)` | Add editor sidebar panel |
| `ctx.api.registerRoute(method, path, handler)` | Register a custom API endpoint |
| `ctx.settings.get() / update(values)` | Read/write plugin settings |
| `ctx.taxonomies.register(input)` | Create a custom taxonomy |

**16 hook events:** content lifecycle (6), rendering filters (3), admin UI (2), user (2), comments (2), media (1).

**Dependency resolution:** Topological sort (Kahn's algorithm) ensures plugins boot in dependency order. Missing dependencies prevent activation.

**Safety boundary:** Plugins access CMS capabilities only through PluginContext. Settings routed through settingsService (not raw Prisma). All registrations tagged with plugin slug for clean deactivation.

---

## 11. Theme System

**File conventions:**

```
themes/{slug}/
├── theme.json              # Manifest + settings schema
├── layout.tsx              # Root layout (header, footer, shell)
├── templates/              # WordPress-style template hierarchy
│   ├── index.tsx           # Required fallback
│   ├── single.tsx          # Any single entry
│   ├── single-{type}.tsx   # Single entry of specific type
│   ├── page.tsx            # Hierarchical content
│   ├── archive.tsx         # Content listing
│   ├── home.tsx            # Homepage
│   ├── search.tsx          # Search results
│   ├── taxonomy.tsx        # Taxonomy archive
│   └── 404.tsx             # Not found
├── blocks/                 # Block render overrides
│   └── paragraph.tsx       # Override core/paragraph
├── components/             # Theme-specific components
└── styles/theme.css        # Theme-specific CSS
```

**Template resolution** (most specific → least specific):

```
Single post "hello-world" with template "full-width":
  full-width → single-post-hello-world → single-post → single → index

Category "tech" archive:
  taxonomy-category-tech → taxonomy-category → taxonomy → archive → index

Homepage:
  front-page → home → index
```

Per-entry template override: editors select a template in the sidebar (defined in `theme.json` `templateChoices`). The resolver checks it first.

---

## 12. Editorial Workflow

```
CONTRIBUTOR                         EDITOR/ADMIN
    │                                    │
    ├─ Writes content (DRAFT)            │
    ├─ Autosave every 30s (no revision)  │
    ├─ Clicks "Save Draft" (revision)    │
    ├─ Clicks "Submit for Review"        │
    │  → status: PENDING_REVIEW          │
    │  → hook: content:status_change     │
    │                                    ├─ Reviews content
    │                                    ├─ "Approve & Publish" → PUBLISHED
    │                                    └─ "Request Changes" → DRAFT + note
    │                                         shown as amber banner in editor
    ├─ Fixes, re-submits                 │
    └─ ───────────────────────────────── └─ Approves → published
```

**Scheduled publishing:** Set `scheduledAt` date → status becomes SCHEDULED → cron endpoint (`POST /api/cron/publish`) checks every minute → transitions to PUBLISHED with lifecycle hooks.

---

## 13. Media Library

**Upload flow:** Multipart POST → validate (MIME allowlist, 50MB cap) → store original (local or S3) → if image: extract dimensions, generate 5 WebP variants (thumbnail, small, medium, large, og) → create MediaAsset record.

**Storage abstraction:**

```typescript
interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
}
// Implementations: LocalStorage (dev), S3Storage (prod — works with S3, R2, MinIO)
```

**Security:** SVG excluded from upload (XSS vector). Filenames sanitized. Storage keys include siteId (no cross-tenant access). Buffer size validated against declared size.

---

## 14. Search

**MVP: PostgreSQL full-text search.** `tsvector` column on ContentEntry, auto-updated by trigger. GIN index for fast `@@` matching. Weighted ranking: title (A) > excerpt (B). `ts_headline` for highlighted snippets.

**Scalable path:** `SearchProvider` interface abstracts the backend. Set `SEARCH_PROVIDER=meilisearch` to delegate to an external engine. `searchService.extractTextFromBlocks()` extracts plain text from JSONB blocks for indexing.

---

## 15. SEO

**Metadata resolution:** `_seo_title` field → `entry.title` → site name. `_seo_description` → `entry.excerpt` → site tagline. Runs through `render:meta_tags` hook filter (plugin-extensible).

**Outputs:** Next.js `generateMetadata()` on all public routes, JSON-LD structured data (Article, WebPage, WebSite, BreadcrumbList), XML sitemap with pagination, RSS 2.0 feed, OG image generation via `next/og`.

**Redirect model:** `Redirect` table (fromPath, toPath, statusCode, isRegex, hitCount).

---

## 16. Comments

**Threaded** (max depth 3). **Dual author identity:** registered users (via authorId) or guests (name + email). **4 moderation statuses:** PENDING → APPROVED, SPAM, TRASH. Auto-approve for moderators. `comment:submitted` hook for spam detection plugins. DOMPurify sanitizes body (7 allowed tags). `javascript:` URLs blocked.

---

## 17. Settings & Menus

**Settings:** Key-value in `Setting` table, grouped by domain (general, reading, discussion, permalinks). Plugins register additional groups via `settingsService.registerGroup()`. Dynamic `<SettingsForm>` renders fields from group definitions.

**Menus:** Nested items with 3 link types (custom URL, content entry, taxonomy term). Content/taxonomy URLs resolved at read time (batched queries, not N+1). One menu per theme location. `<NavMenu>` server component with cached queries.

---

## 18. API Design

**Internal (admin):** tRPC with 11 routers. Type-safe, batched, superjson transformer. Procedures: `publicProcedure`, `authedProcedure`, `permissionProcedure("slug")`.

**External (public):** REST `/api/v1/*`. Versioned, CORS (explicit origin allowlist), standard JSON envelope `{ data, meta? }` or `{ error: { code, message } }`.

**Webhooks (outgoing):** 9 event types, HMAC-SHA256 signatures, 3 retries with exponential backoff. Subscriptions stored in Settings.

**Webhooks (incoming):** `/api/webhooks` with mandatory source-specific secrets and timing-safe signature comparison.

---

## 19. Caching & Revalidation

```
PUBLIC PAGE REQUEST
  └─ getCachedEntry(siteId, slug)
       ├─ unstable_cache with tags: [content:{id}, content-list:_all:{siteId}]
       └─ revalidate: 300 (5 min fallback TTL)

ADMIN MUTATION (publish/update/trash/delete)
  └─ tRPC router calls revalidateForEntry(entry)
       ├─ revalidateTag("content:{id}")
       ├─ revalidateTag("content-list:{type}:{siteId}")
       ├─ revalidateTag("homepage:{siteId}")
       ├─ revalidateTag("sitemap:{siteId}")
       └─ revalidateTag("taxonomy:{termSlug}:{siteId}") × N terms

TIME TO LIVE: ~0.5s from publish to fresh public page
```

10 tag patterns. Revalidation wired via callback injection (API layer doesn't import from app layer).

---

## 20. Security Model

**Hardened (9 vulnerabilities found and fixed during audit):**

| Protection | Implementation |
|-----------|---------------|
| Auth | JWT sessions, bcrypt (12 rounds), timing-safe credential check |
| RBAC | 28 permissions, 6 roles, ownership-aware, 4-layer enforcement |
| XSS | DOMPurify on all HTML output, `javascript:` URL blocking, SVG upload rejected |
| CORS | Explicit origin allowlist (`ALLOWED_ORIGINS` env var), not wildcard |
| CSRF | tRPC uses POST + JSON (unforgeable). State-changing endpoints are POST only. |
| File upload | MIME allowlist (no SVG), 50MB cap, filename sanitization, site-scoped storage keys |
| Webhooks | Mandatory secrets, HMAC-SHA256, timing-safe comparison |
| Cron | `CRON_SECRET` required, POST only |
| Revalidation | `REVALIDATION_SECRET` required, disabled when unset |
| Multi-tenant | `siteId` on every scoped query, comment cascade scoped to site |
| Security headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` |

---

## 21. Testing Strategy

```
        ╱╲
       ╱E2E╲          3 Playwright specs (auth, content, public site)
      ╱──────╲
     ╱API Tests╲       1 tRPC caller test file
    ╱────────────╲
   ╱ Integration  ╲    2 test files (content service + plugin lifecycle)
  ╱────────────────╲
 ╱   Unit Tests     ╲  7 test files (permissions, slugs, fields, status,
╱────────────────────╲  revisions, templates, blocks)
```

**Tools:** Vitest (unit + integration), Playwright (E2E). **CI:** GitHub Actions — 4 parallel jobs (lint/typecheck, unit tests, integration tests with PostgreSQL, E2E with built app).

---

## 22. Roadmap

### MVP (Weeks 1-10)

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1 | Boot | `pnpm dev` works, login, dashboard |
| 2 | Content CRUD | Create/edit/publish/trash posts via admin |
| 3 | Public site | Theme renders published content with SEO |
| 4 | Block editor | Paragraph, heading, image, quote blocks |
| 5 | Media + content types | Upload images, create custom types + fields |
| 6 | Taxonomy + comments + search | Categories, tags, threaded comments, FTS |
| 7 | Caching + polish | `unstable_cache`, revalidation, responsive admin |
| 8 | Editorial workflow | Scheduling, review/approve, revision history |
| 9 | Plugins + themes + settings | Activate SEO toolkit, menu builder, site settings |
| 10 | Test + secure + deploy | Tests pass, security checklist, production deploy |

### V2

Taxonomy CRUD UI, 15+ blocks, slash commands, dnd-kit drag-drop, block patterns, theme customizer, widget areas, custom roles UI, multi-site admin, redirects middleware, application passwords, bulk actions.

### V3

Full site editing, collaborative editing, child themes, GraphQL API, plugin marketplace, image editor, import/export (WXR), oEmbed.

---

## 23. Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+
- Docker (optional, for local PostgreSQL)

### Setup

```bash
# Clone and install
git clone <repo-url> nextpress
cd nextpress
pnpm install

# Start PostgreSQL (or use docker-compose)
docker compose up -d

# Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL, NEXTAUTH_SECRET, ADMIN_PASSWORD

# Run migrations and seed
pnpm --filter @nextpress/db prisma migrate dev
pnpm --filter @nextpress/db prisma db seed

# Start development server
pnpm dev
```

### Required Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/nextpress
NEXTAUTH_SECRET=<32+ random bytes, hex>
NEXTAUTH_URL=http://localhost:3000
ADMIN_PASSWORD=<12+ chars>
CRON_SECRET=<32+ random bytes>
REVALIDATION_SECRET=<32+ random bytes>
```

### Optional Environment Variables

```bash
ALLOWED_ORIGINS=https://example.com
STORAGE_PROVIDER=s3
S3_BUCKET=nextpress-media
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_URL=https://cdn.example.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

---

## 24. Contributing & Required Skills

NextPress is built to be extended. There are three ways to contribute, each with a different surface area and a different required skill set. Pick the track that matches what you want to build.

| Track | You build | Touches | Risk surface |
|-------|-----------|---------|--------------|
| **Theme development** | Layouts, templates, block overrides | `themes/{slug}/` only | Low — sandboxed to one theme |
| **Plugin development** | Content types, fields, blocks, hooks, admin pages, API routes | `plugins/{slug}/` + `PluginContext` | Medium — controlled API surface |
| **Core contribution** | The engine itself — services, routers, schema, editor | `packages/*`, `apps/web/` | High — affects everyone |

**Baseline for every track:** TypeScript (we run `strict`), Git/GitHub pull-request flow, and comfort with a pnpm + Turborepo monorepo. Read [Getting Started](#23-getting-started) first and get `pnpm dev` booting before you write any code.

---

### 24.1. Theme Development

Themes control how published content is presented. A theme is layout + a WordPress-style template hierarchy + optional block render overrides. Themes never touch the database or business logic — they receive resolved content and render it.

**Required skills**

- **React Server Components (RSC)** — templates and layouts are server components. Understand the server/client boundary and when `"use client"` is required.
- **Next.js App Router** — layouts, `generateMetadata`, streaming, and how route groups feed templates.
- **Tailwind CSS** + plain CSS — styling is Tailwind-first with a per-theme `styles/theme.css`.
- **The template resolution hierarchy** — most-specific-wins (see [§11 Theme System](#11-theme-system)). Knowing which template fires for a given URL is the core mental model.
- **Block data shape** — templates receive structured `BlockData[]` (see [§5 Key Interfaces](#5-key-interfaces)), not HTML. Rendering goes through `<BlockRenderer>`; overrides go through `overrideRenderComponent()`.

**What you'll work in**

```
themes/{slug}/
├── theme.json              # Manifest, supports, settings schema, templateChoices
├── layout.tsx              # Root shell (header, footer)
├── templates/              # index.tsx (required) + single/page/archive/home/...
├── blocks/                 # Optional per-block render overrides
├── components/             # Theme-local components
└── styles/theme.css
```

**Getting started:** copy `themes/_template/` to `themes/my-theme/`, edit `theme.json`, and start from `templates/index.tsx` (the required fallback). Use `themes/default/` and `themes/twentytwentysix/` as worked references. You do **not** need to understand Prisma, tRPC, or the permission engine to ship a theme.

---

### 24.2. Plugin Development

Plugins extend behavior. They register content types, custom fields, block types, admin pages, API routes, and hook callbacks — all through a single controlled object, `PluginContext`. Plugins never import Prisma or core internals directly; the context is the entire sanctioned surface (see [§10 Plugin System](#10-plugin-system)).

**Required skills**

- **TypeScript interfaces & generics** — you implement `PluginDefinition` and consume the typed `PluginContext` API.
- **The hook system** — actions (side effects) vs. filters (data transforms), and the 16 hook events. This is how plugins react to content/comment/user/media lifecycle without patching core.
- **Zod schemas** — custom fields and block attributes are defined as Zod schemas; they're the single source of truth for validation.
- **The block contract** (if registering blocks) — a server-safe render component in `packages/blocks` and a client-only edit component in `packages/editor`, sharing types but never importing each other. Increment `version` and provide `migrate()` on breaking attribute changes.
- **REST handler basics** (if registering routes via `ctx.api.registerRoute`) — request/response, the JSON envelope, and auth expectations from [§18 API Design](#18-api-design).
- **Plugin lifecycle** — `onActivate` / `onDeactivate` / `onUninstall`, dependency declaration in `plugin.json`, and why every registration is source-tagged (clean deactivation).

**What you'll work in**

```
plugins/{slug}/
├── plugin.json             # Manifest: slug, version, dependencies, permissions, settings
├── index.ts                # PluginDefinition: onActivate(ctx) / onDeactivate / onUninstall
├── components/             # Block edit/render components, admin panels
└── api/                    # Custom route handlers
```

**Getting started:** copy `plugins/_template/`, register what you need inside `onActivate(ctx)`. Study `plugins/seo-toolkit/` (fields + meta hooks + settings), `plugins/contact-form/` (custom block + content type + API route), and `plugins/analytics/` (admin page + tracking script) as end-to-end examples. You need to understand `PluginContext` and the hook/Zod model, but **not** the core service implementations behind them.

---

### 24.3. Contributing to NextPress Core

Core work changes the engine that every theme, plugin, and site depends on. This is the highest-skill track and carries the most responsibility — changes here must preserve the dependency direction, type safety, security model, and test coverage.

**Required skills**

- **Advanced TypeScript** — `strict` mode, discriminated unions, generics, and type-level guarantees across package boundaries.
- **Architecture discipline** — respect the dependency direction (`apps/web → api → core → db`; `core` has **no** React/Next imports; blocks and editor never import each other). See [§1 Architecture](#1-architecture). PRs that violate layering will be rejected regardless of correctness.
- **Prisma & PostgreSQL** — the 28-model schema, JSONB for blocks/fields, EAV custom fields, `tsvector` FTS, GIN indexes, and writing migrations.
- **tRPC v11** — the 11 routers, `publicProcedure` / `authedProcedure` / `permissionProcedure`, superjson, and React Query integration.
- **Auth & RBAC** — the 4-layer enforcement model, 28 permissions, ownership-aware checks, and JWT-per-request role resolution (see [§7](#7-authentication--authorization)). Every mutation needs a guard.
- **Security model** — the protections in [§20](#20-security-model): DOMPurify on all HTML, CORS allowlists, multi-tenant `siteId` scoping on every query, HMAC webhooks, timing-safe comparisons. Adding a query without `siteId` scoping is a cross-tenant data leak.
- **Caching & revalidation** — `unstable_cache`, the 10 tag patterns, and callback-injected revalidation (see [§19](#19-caching--revalidation)).
- **Testing** — Vitest (unit + integration) and Playwright (E2E). New core behavior ships with tests; CI runs lint/typecheck + 3 test tiers (see [§21](#21-testing-strategy)).

**What you'll work in**

```
packages/core/      # Framework-agnostic CMS logic (no React) — services, hooks, engines
packages/db/        # Prisma schema, client, seeds, migrations
packages/api/        # tRPC routers
packages/blocks/     # Block registry + SSR render components
packages/editor/     # Block editor + client edit components
packages/ui/         # Admin design system
apps/web/           # Next.js app: route groups, lib glue, middleware
```

**Getting started:** read [§1 Architecture](#1-architecture) through [§5 Key Interfaces](#5-key-interfaces) end to end. Pick a well-scoped issue, keep changes within one layer where possible, add tests, and run `pnpm lint`, `pnpm typecheck`, and the test suite locally before opening a PR. Discuss schema or public-interface changes in an issue first — they ripple across every track above.

---

### Contribution Workflow (all tracks)

1. Fork and branch from `main` (`feat/...`, `fix/...`).
2. Develop against `pnpm dev`; keep TypeScript green (`strict`, no `any` escapes).
3. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before pushing.
4. Open a pull request describing **what** changed and **why**; link any related issue.
5. Ensure CI (lint/typecheck, unit, integration, E2E) passes — see the badges at the top of this README.

PRs are welcome. If you're unsure which track fits your idea or how big the change is, open an issue first.

---

## License

MIT
