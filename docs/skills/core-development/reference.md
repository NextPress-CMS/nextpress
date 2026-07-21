# NextPress Core — Engine Reference

All patterns below are the real conventions from the codebase, cited with `file:line`.

## tRPC procedures

`packages/api/src/trpc.ts` — `initTRPC` with `superjson` transformer.

```ts
publicProcedure = t.procedure;                              // :19
authedProcedure = t.procedure.use(enforceAuth);            // :30 — throws UNAUTHORIZED if !ctx.session || !ctx.auth
permissionProcedure(permission: PermissionSlug)            // :65 — authedProcedure + can(); throws FORBIDDEN with reason
anyPermissionProcedure(permissions[])                      // :81 — super_admin bypass + some(can().granted)
```

`context.ts`: `TrpcContext { session: SessionUser | null; auth: AuthContext | null }`; `AuthedTrpcContext` narrows both non-null.

`root.ts:18` — flat `router({...})` of the sub-routers; `export type AppRouter = typeof appRouter`.

### Example query + guarded mutation (`routers/content.ts`)

```ts
// Public query
getBySlug: publicProcedure
  .input(z.object({ siteId: z.string().cuid(), slug: z.string() }))
  .query(async ({ input }) => contentService.getBySlug(input.siteId, input.slug)),   // :51

// Authed mutation — permission enforced INSIDE the service, then revalidate
create: authedProcedure
  .input(createContentEntrySchema)
  .mutation(async ({ ctx, input }) => {
    const entry = await contentService.create(ctx.auth, input);
    if (entry.status === "PUBLISHED") await revalidateEntry(entry);
    return entry;
  }),                                                                                 // :84
```

**Pattern:** routers stay thin and pass `ctx.auth` (or `ctx.auth.siteId`) straight into services. Permission checks live in the service. `permissionProcedure` is available when you want router-level gating too.

### Revalidation callback injection (`routers/content.ts:19`)

The app layer registers callbacks; the API layer calls them, no-op if unset:

```ts
// module scope in the API package
let onEntryChange: ((entry: ContentEntryDto) => Promise<void>) | null = null;
export function setRevalidationCallbacks(cb: { onEntryChange; onEntryDelete }) { /* assign */ }
async function revalidateEntry(entry) { if (onEntryChange) await onEntryChange(entry); }
```

Guardrail comment in source: **`packages/api` must NOT import from `apps/web`.** The arrow is `apps/web → packages/api`, never reversed. Mutations revalidate only when `status === "PUBLISHED"` (or on trash/delete to purge public pages).

## Service pattern

`packages/core/src/<domain>/<domain>-service.ts` — object literal of async methods, exported singleton. Prisma is a module singleton.

```ts
import { prisma } from "@nextpress/db";
import { assertCan, canPublishContent } from "../auth/permissions";
import { NotFoundError, ValidationError } from "../errors/cms-error";

export const contentService = {
  async create(auth: AuthContext, input: CreateContentEntryInput) {
    assertCan(auth, "create_content");                       // permission guard first
    if (input.status === "PUBLISHED") canPublishContent(auth);
    // every where clause is siteId-scoped:
    const existing = await prisma.contentEntry.findUnique({
      where: { siteId_slug: { siteId: auth.siteId, slug: input.slug } },
    });
    if (existing) throw new ValidationError("Slug already exists");
    // ...
  },
  async delete(auth: AuthContext, id: string) {
    assertCan(auth, "delete_media");
    const row = await prisma.mediaAsset.findFirst({ where: { id, siteId: auth.siteId } });
    if (!row) throw new NotFoundError("media", id);
    // ...
  },
};
```

Read methods take `siteId` as an explicit first param (`getBySlug(siteId, slug)`), so callers must supply the tenant scope. Storage keys embed `auth.siteId` (media) — no cross-tenant access.

## Error hierarchy (`packages/core/src/errors/cms-error.ts`)

Base `CmsError extends Error` with `(message, code, statusCode=500, details?)`. Subclasses:

| Class | code | status |
|---|---|---|
| `AuthenticationError` | `UNAUTHENTICATED` | 401 |
| `AuthorizationError` | `FORBIDDEN` | 403 (+details) |
| `NotFoundError(resource, id?)` | `NOT_FOUND` | 404 |
| `ValidationError` | `VALIDATION_ERROR` | 400 |

Code constants live in `errors/error-codes.ts`. Always throw these — never a raw `Error`.

## Auth / permissions (`packages/core/src/auth/`)

Pure functions, no DB, no side effects.

```ts
can(auth, permission, resource?): PermissionResult          // permissions.ts:34
assertCan(auth, permission, resource?): void                // :74 — throws AuthorizationError with {permission, role, siteId}
assertAuthenticated(auth): asserts auth is AuthContext      // :93
```

`PermissionResult = { granted: true } | { granted: false; reason: string }`.

`can()` behavior: `super_admin` bypasses everything; otherwise checks `auth.permissions.has(permission)`; for `edit_own_content` / `delete_own_content` it applies ownership logic and falls back to the `_others_` variant when a `resource.ownerId` is provided.

Named shortcuts (compose `can()`, never bypass): `canCreateContent`, `canEditContent(auth, ownerId)`, `canDeleteContent(auth, ownerId)`, `canPublishContent`, `canUploadMedia`, `canModerateComments`, `canManageUsers`, `canManageSettings`, `canManagePlugins`, `canManageAppearance`, `canAccessAdmin`.

**`RoleSlug`** = `super_admin | admin | editor | author | contributor | subscriber` (`auth-types.ts:74`).

**`AuthContext`** = `{ user: SessionUser; siteId: string; role: RoleSlug; permissions: Set<PermissionSlug> }` (`:98`) — resolved per-request (role can differ per site; not baked into the JWT beyond the user identity).

**28 `PermissionSlug` values** (`auth-types.ts:22`): `create_content, edit_own_content, edit_others_content, delete_own_content, delete_others_content, publish_content, manage_categories, manage_tags, upload_media, delete_media, moderate_comments, list_users, create_users, edit_users, delete_users, promote_users, switch_themes, customize_theme, manage_menus, activate_plugins, manage_plugins, manage_settings, manage_content_types, manage_fields, manage_taxonomies, manage_sites, read, edit_profile`. Plugins extend via module augmentation of `PermissionMap`.

`ROLE_DEFINITIONS` (`roles.ts:30`) is the **seed-data** source for role→permission mapping (DB is authoritative at runtime). `super_admin` is intentionally absent — it bypasses.

## Prisma / DB (`packages/db`)

- `src/client.ts`: `PrismaClient` singleton via `globalForPrisma` on `globalThis` (HMR-safe). Dev logs `query/error/warn`, prod `error`.
- `src/index.ts`: re-exports `prisma` + 28 model/enum types (`User, Site, ContentEntry, ContentType, FieldDefinition, MediaAsset, Comment, Revision, ...`; enums `ContentStatus, CommentStatus, FieldType, BlockTemplateMode`).
- `src/repositories/*`: repository-per-aggregate (14 files).
- `src/extensions/site-scoped.ts` and `soft-delete.ts`: **empty stubs** — not implemented. Scope by `siteId` manually in `where`.
- `prisma/schema.prisma`: 28 models; `siteId` appears ~49×. Per-model pattern: `siteId String` + `site Site @relation(fields: [siteId], references: [id], onDelete: Cascade)`, compound uniques (`@@unique([siteId, slug])`, `@@unique([siteId, contentTypeId, slug])`), and siteId-leading composite indexes (e.g. `@@index([siteId, contentTypeId, status, publishedAt(sort: Desc)])`).

**Add a migration:** edit `schema.prisma`, then:

```bash
pnpm --filter @nextpress/db exec prisma migrate dev --name <name>
```

There is a `prisma/migrations/manual/` dir for hand-written SQL when needed.

## Blocks vs editor split

- **`@nextpress/blocks` = server-safe.** Deps: `isomorphic-dompurify`, `zod` only (no React runtime dep, no `"use client"`). Render components sanitize with a tight allowlist:

```ts
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content, {
  ALLOWED_TAGS: ["strong","em","a","code","br","span","mark"],
  ALLOWED_ATTR: ["href","target","rel","class"],
}) }}
```

- **`@nextpress/editor` = client-only** (`editor.tsx:1` `"use client";`). Depends on `@nextpress/blocks`.
- **Registration** (`packages/blocks/src/registry.ts`): module-scoped `Map<string, BlockDefinition>` singleton. Blocks register at import via side-effect: each block file calls `registerBlock({ type, attributesSchema, defaultAttributes, version, migrate?, renderComponent, ... })`. API: `registerBlock, unregisterBlock, getBlockDefinition, getAllBlockDefinitions, getBlocksByCategory, isBlockRegistered, overrideRenderComponent, migrateBlockAttributes, validateBlockAttributes`. `renderComponent: null` = editor-only.

## Testing

- **Vitest.** `packages/core/vitest.config.ts`: `globals: true`, `environment: "node"`, `include: ["src/__tests__/**/*.test.ts"]`, v8 coverage. Resolve aliases map `@nextpress/db → ../db/src` and `@nextpress/blocks → ../blocks/src`.
- Layout: `packages/core/src/__tests__/{unit,integration,mocks}/` + `helpers.ts`, `setup.ts`. API tests in `packages/api/src/__tests__/`.
- **Pattern** (`__tests__/unit/content-service-unit.test.ts`): mock db first, then dynamic-import the service:

```ts
vi.mock("@nextpress/db", () => ({ prisma: mockPrisma }));      // from ../mocks/prisma
const { contentService } = await import("../../content/content-service");
// build explicit AuthContext fixtures per role to assert permission behavior
```

- Commands: `pnpm --filter @nextpress/core test`, single file via `... exec vitest run <path>`.
- Playwright E2E config lives under `apps/*` (not in the packages tree).

## Guardrail checklist before opening a PR

- [ ] Dependency direction respected (`api → core → {blocks, db}`, `editor → blocks`; no `blocks → core`, no `api → apps`).
- [ ] No runtime React/Next in `packages/core` (type-only `import type` only).
- [ ] Every new query scoped by `siteId`.
- [ ] Every mutation has `assertCan(...)` / `permissionProcedure(...)`.
- [ ] User HTML sanitized via DOMPurify allowlist.
- [ ] Throws `CmsError` subclasses, not raw `Error`.
- [ ] Tests added; `pnpm lint`, `pnpm typecheck`, and the relevant `test` pass locally.
