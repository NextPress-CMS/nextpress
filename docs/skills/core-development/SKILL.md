---
name: nextpress-core-development
description: Contribute to the NextPress CMS engine itself — packages/core services, packages/api tRPC routers, packages/db Prisma schema/migrations, packages/blocks and packages/editor, and apps/web glue. Use when changing engine behavior that every theme, plugin, and site depends on. This is the highest-risk track: changes must preserve the dependency direction, framework-free core, siteId multi-tenant scoping, permission guards on every mutation, HTML sanitization, and test coverage.
---

# NextPress Core Development

Core work changes the engine every theme, plugin, and site depends on. Correctness alone is not enough — a change that violates layering, drops `siteId` scoping, or skips a permission guard will be rejected regardless of whether it "works". Treat the guardrails below as non-negotiable.

## The hard guardrails (violating any one fails review)

1. **Dependency direction — never reversed.**
   `apps/web → packages/api → packages/core → { packages/blocks, packages/db }`, and `packages/editor → packages/blocks`.
   - `packages/blocks` must **not** import `packages/core` (`BlockData` lives in blocks to break the cycle; core re-exports it).
   - `packages/api` must **not** import `apps/*`. The app injects revalidation via `setRevalidationCallbacks(...)`; the API layer calls the injected callbacks, no-op when unset.
2. **core is framework-free.** No runtime React/Next imports in `packages/core`. The **only** tolerated exception is type-only `import type { ... } from "react"` (currently just `ComponentType` in `theme-types.ts`). No JSX runtime, no `next/*`.
3. **siteId scoping on every query.** Every DB read/write is scoped by `auth.siteId` (or an explicit `siteId` param) in the `where`. Adding a query without `siteId` scoping is a cross-tenant data leak. The schema backs this with `@@unique([siteId, ...])` and siteId-leading indexes plus `onDelete: Cascade`.
4. **Permission guard on every mutation.** Call `assertCan(auth, "<slug>")` (or `permissionProcedure("<slug>")`) at the top of every mutating service method. Enforcement lives in **services**, not routers — routers just pass `ctx.auth`. Ownership via `can(auth, "edit_own_content", { ownerId })`.
5. **Sanitize all user HTML.** Any user HTML must pass `DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })` with an explicit allowlist before `dangerouslySetInnerHTML` (blocks layer). SVG uploads are rejected.
6. **Throw CmsError subclasses**, not raw `Error`: `NotFoundError`, `ValidationError`, `AuthorizationError`, `AuthenticationError`.
7. **Ship tests.** New core behavior lands with Vitest tests. Mock `@nextpress/db`, dynamic-import the service after mocking, and build `AuthContext` role fixtures for permission paths.

## Package map

| Package | Name | Depends on | Runtime |
|---|---|---|---|
| `packages/db` | `@nextpress/db` | (leaf) | Prisma client singleton, repositories, schema |
| `packages/blocks` | `@nextpress/blocks` | (leaf) | server-safe block registry + SSR render components |
| `packages/core` | `@nextpress/core` | `blocks`, `db` | framework-free CMS logic — services, hooks, engines |
| `packages/api` | `@nextpress/api` | `core`, `db` | tRPC routers |
| `packages/editor` | `@nextpress/editor` | `blocks` | **client-only** (`"use client"`) block editor |
| `packages/ui` | `@nextpress/ui` | (none) | admin design system |
| `apps/web` | — | `api`, `core`, `editor`, `ui` | Next.js app, route groups, lib glue |

## Commands

Root scripts delegate to Turbo (`turbo.json` pipeline: `build/lint/typecheck/test` all `dependsOn ["^build"]`; `dev` is persistent + uncached):

```bash
pnpm dev          # turbo dev
pnpm build        # turbo build
pnpm lint         # turbo lint
pnpm typecheck    # turbo typecheck (each pkg: tsc --noEmit)
pnpm test         # turbo test (vitest run in core + api)
```

Per-package / single file:

```bash
pnpm --filter @nextpress/core test
pnpm --filter @nextpress/core typecheck
pnpm --filter @nextpress/core exec vitest run src/__tests__/unit/content-service-unit.test.ts
```

**Prisma — no convenience scripts are wired.** There is no `db:migrate`/`db:seed` script anywhere; run the CLI through the db package directly:

```bash
pnpm --filter @nextpress/db exec prisma generate
pnpm --filter @nextpress/db exec prisma migrate dev --name <migration_name>
pnpm --filter @nextpress/db exec prisma db seed
```

Do not invent script names — use `--filter @nextpress/db exec prisma ...`.

## Where things live

- **Services** (`packages/core/src/<domain>/`): plain object literals of async methods exported as a singleton (`export const contentService = { async create(auth, input) {...} }`). Prisma is a module singleton (`import { prisma } from "@nextpress/db"`), not injected.
- **tRPC** (`packages/api/src/`): `trpc.ts` defines `publicProcedure`, `authedProcedure`, `permissionProcedure(slug)`; `root.ts` composes routers; `context.ts` carries `{ session, auth }`.
- **Auth/permissions** (`packages/core/src/auth/`): pure functions, no DB — `can()`, `assertCan()`, role/permission types, the 28 permission slugs.
- **DB** (`packages/db/`): `client.ts` singleton, `repositories/*`, `prisma/schema.prisma` (28 models), `prisma/seeds/`.
- **Blocks vs editor**: `packages/blocks` server-safe (register via `registerBlock`, side-effect on import); `packages/editor` client-only.

The exact procedure/service/error/permission/schema/test patterns with `file:line` citations and copy-ready snippets are in **[reference.md](reference.md)**. Load it before writing engine code.

## Workflow

1. Read the README's Architecture → Key Interfaces sections and this skill's guardrails.
2. Pick a well-scoped change; keep it within one layer where possible.
3. Discuss schema or public-interface changes first — they ripple across themes and plugins.
4. Implement following the service/tRPC/error/permission patterns in reference.md.
5. Add/adjust Vitest tests (and Playwright for app-level flows).
6. Run `pnpm lint`, `pnpm typecheck`, and the relevant `--filter ... test` locally before opening a PR.

## Known gaps (verified absent — do not assume they exist)

- No wired Prisma/db npm scripts — use `--filter @nextpress/db exec prisma ...`.
- `packages/db/src/extensions/site-scoped.ts` and `soft-delete.ts` are **empty stubs** — siteId scoping is enforced manually in service `where` clauses today, not via a Prisma client extension.
- `packages/core/src/validation/sanitize.ts` is an **empty stub** — HTML sanitization actually lives in `packages/blocks` (DOMPurify).
- No packages-level Playwright config — E2E specs live under `apps/*`.
