import "server-only";

/**
 * Host adapters for the Instagram Posts plugin.
 *
 * The plugin's services are written against narrow interfaces (`ContentStore`,
 * `PublishStore`, `SettingsStore`, `MediaUploader`) so they can be unit-tested
 * without a database. This file is the single place those interfaces are bound
 * to real NextPress services and Prisma.
 *
 * SITE ISOLATION: every query below is filtered by `siteId`. That is what
 * guarantees Site A can never read Site B's Instagram mappings, media, or
 * connection — a plugin bug cannot widen the boundary because the boundary is
 * applied here, in the host.
 */

import { prisma } from "@nextpress/db";
import type { AuthContext } from "@nextpress/core/auth/auth-types";
import { contentService } from "@nextpress/core/content/content-service";
import { createContentEntrySchema } from "@nextpress/core/content/content-types";
import { mediaService } from "@nextpress/core/media/media-service";
import { settingsService } from "@nextpress/core/settings/settings-service";
import {
  ConnectionService,
  IG_FIELDS,
  INSTAGRAM_CONTENT_TYPE,
  ImportService,
  InstagramApiClient,
  PublishService,
  SyncService,
  type ContentStore,
  type InstagramSettings,
  type PublishStore,
  type PublishableEntry,
  type SettingsStore,
} from "@nextpress/plugin-instagram-post";
import type { PublishState } from "@nextpress/plugin-instagram-post";

// ── Settings store ──

const settingsStore: SettingsStore = {
  getGroup: (siteId, group) => settingsService.getGroup(siteId, group),
  updateGroup: (auth, input) => settingsService.updateGroup(auth, input),
  set: (siteId, group, key, value) => settingsService.set(siteId, group, key, value),
  delete: (siteId, group, key) => settingsService.delete(siteId, group, key),
};

export const connectionService = new ConnectionService({ store: settingsStore });

// ── Field helpers ──

/**
 * Look up the field-definition id for a key on a content type.
 *
 * Cached per process: definitions change only when a plugin activates, and
 * resolving them on every field write would add a query per imported post.
 */
const fieldIdCache = new Map<string, string>();

async function resolveFieldIds(
  siteId: string,
  contentTypeSlug: string,
): Promise<Map<string, string>> {
  const cacheKey = `${siteId}:${contentTypeSlug}`;
  const cached = fieldIdCache.get(cacheKey);

  const definitions = await prisma.fieldDefinition.findMany({
    where: {
      siteId,
      contentType: { slug: contentTypeSlug },
      key: { startsWith: "instagram_" },
    },
    select: { id: true, key: true },
  });

  const map = new Map(definitions.map((d) => [d.key, d.id]));
  if (cached === undefined && map.size > 0) fieldIdCache.set(cacheKey, "warm");
  return map;
}

/**
 * Write Instagram field values directly.
 *
 * Uses upsert-per-field rather than the content service's update path because
 * sync writes touch a handful of plugin fields and must not create a revision
 * or bump `updatedAt` semantics for an editorial change that never happened.
 * A `null` value clears the field.
 */
async function writeFields(
  siteId: string,
  contentEntryId: string,
  contentTypeSlug: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const fieldIds = await resolveFieldIds(siteId, contentTypeSlug);

  for (const [key, value] of Object.entries(fields)) {
    const fieldDefinitionId = fieldIds.get(key);
    if (!fieldDefinitionId) continue;

    if (value === null || value === undefined) {
      await prisma.fieldValue.deleteMany({ where: { contentEntryId, fieldDefinitionId } });
      continue;
    }

    await prisma.fieldValue.upsert({
      where: { contentEntryId_fieldDefinitionId: { contentEntryId, fieldDefinitionId } },
      update: { value: value as never },
      create: { contentEntryId, fieldDefinitionId, value: value as never },
    });
  }
}

async function readFields(contentEntryId: string): Promise<Record<string, unknown>> {
  const values = await prisma.fieldValue.findMany({
    where: { contentEntryId },
    select: { value: true, fieldDefinition: { select: { key: true } } },
  });

  return Object.fromEntries(values.map((v) => [v.fieldDefinition.key, v.value]));
}

// ── Content store ──

export const contentStore: ContentStore = {
  /**
   * THE IDEMPOTENCY PRIMITIVE.
   *
   * Resolves an Instagram media id to a content entry, scoped to the site.
   * Every import path calls this immediately before writing, which is what
   * makes repeated imports and concurrent cron runs converge on one entry.
   */
  async findByInstagramMediaId(siteId, mediaId) {
    const value = await prisma.fieldValue.findFirst({
      where: {
        fieldDefinition: { key: IG_FIELDS.mediaId, siteId },
        value: { equals: mediaId },
        contentEntry: { siteId },
      },
      select: {
        contentEntry: { select: { id: true, title: true, slug: true } },
      },
    });

    return value?.contentEntry ?? null;
  },

  async createEntry(auth, input) {
    // Parse through the schema so defaults (menuOrder, termIds, blocks) are
    // applied by the same rules the content service itself enforces.
    const entry = await contentService.create(
      auth,
      createContentEntrySchema.parse({
        contentTypeSlug: input.contentTypeSlug,
        title: input.title,
        slug: input.slug,
        excerpt: input.excerpt,
        blocks: input.blocks,
        status: input.status,
      }),
    );

    await writeFields(auth.siteId, entry.id, input.contentTypeSlug, input.fields);

    // Preserve the ORIGINAL Instagram publication date so the archive reads
    // chronologically instead of collapsing to the import date.
    if (input.publishedAt) {
      await prisma.contentEntry.update({
        where: { id: entry.id },
        data: { publishedAt: input.publishedAt },
      });
    }

    return { id: entry.id, slug: entry.slug };
  },

  async updateEntry(auth, entryId, input) {
    if (input.fields) {
      await writeFields(auth.siteId, entryId, INSTAGRAM_CONTENT_TYPE, input.fields);
    }

    if (input.excerpt !== undefined) {
      await prisma.contentEntry.updateMany({
        // siteId in the filter keeps a stray id from crossing tenants.
        where: { id: entryId, siteId: auth.siteId },
        data: { excerpt: input.excerpt },
      });
    }
  },

  async attachMedia(auth, entryId, mediaIds) {
    for (const [index, mediaId] of mediaIds.entries()) {
      // The first asset doubles as the entry's featured image.
      const role = index === 0 ? "featured_image" : "attachment";

      // ContentMedia's primary key is (entry, asset, role) — the upsert key
      // must include role, or a re-import would attempt a duplicate insert.
      await prisma.contentMedia.upsert({
        where: {
          contentEntryId_mediaAssetId_role: {
            contentEntryId: entryId,
            mediaAssetId: mediaId,
            role,
          },
        },
        update: { sortOrder: index },
        create: { contentEntryId: entryId, mediaAssetId: mediaId, sortOrder: index, role },
      });
    }
  },
};

// ── Publish store ──

export const publishStore: PublishStore = {
  async getPublishableEntry(siteId, entryId): Promise<PublishableEntry | null> {
    const entry = await prisma.contentEntry.findFirst({
      where: { id: entryId, siteId },
      select: {
        id: true,
        status: true,
        excerpt: true,
        mediaAttachments: {
          orderBy: { sortOrder: "asc" },
          select: {
            mediaAsset: {
              select: { id: true, mimeType: true, size: true, width: true, height: true, duration: true, url: true, alt: true },
            },
          },
        },
      },
    });

    if (!entry) return null;

    const fields = await readFields(entryId);
    const settings = await connectionService.getSettings(siteId);

    const caption =
      (fields[IG_FIELDS.publishCaption] as string | undefined) ??
      (settings.captionFromExcerpt ? (entry.excerpt ?? undefined) : undefined);

    return {
      id: entry.id,
      status: entry.status,
      publishStatus: ((fields[IG_FIELDS.publishStatus] as PublishState) ?? "NOT_PUBLISHED"),
      publishContainerId: fields[IG_FIELDS.publishContainerId] as string | undefined,
      publishMediaId: fields[IG_FIELDS.publishMediaId] as string | undefined,
      publishRetryCount: Number(fields[IG_FIELDS.publishRetryCount] ?? 0),
      caption,
      altText: entry.mediaAttachments[0]?.mediaAsset.alt ?? undefined,
      media: entry.mediaAttachments.map((attachment) => ({
        mimeType: attachment.mediaAsset.mimeType,
        size: attachment.mediaAsset.size,
        width: attachment.mediaAsset.width,
        height: attachment.mediaAsset.height,
        duration: attachment.mediaAsset.duration,
        // Instagram fetches this URL itself, so it must be absolute and public.
        url: toAbsoluteUrl(attachment.mediaAsset.url),
      })),
    };
  },

  async updatePublishState(auth, entryId, fields) {
    const entry = await prisma.contentEntry.findFirst({
      where: { id: entryId, siteId: auth.siteId },
      select: { contentType: { select: { slug: true } } },
    });
    if (!entry) return;

    await writeFields(auth.siteId, entryId, entry.contentType.slug, fields);
  },
};

/**
 * Resolve a stored media URL to an absolute public URL.
 *
 * Instagram downloads publish media from the public internet, so a relative
 * or local path would fail at Meta's end with an unhelpful error. Validation
 * in the plugin catches a non-public result and explains it.
 */
function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? "";
  return base ? new URL(url, base).toString() : url;
}

// ── Service factories ──

export function createInstagramClient(token: { accessToken: string; accountId: string }) {
  return new InstagramApiClient({
    accessToken: token.accessToken,
    accountId: token.accountId,
  });
}

export function createImportService(
  token: { accessToken: string; accountId: string },
  settings: InstagramSettings,
): ImportService {
  return new ImportService({
    client: createInstagramClient(token),
    content: contentStore,
    uploader: mediaService,
    archiveMediaEnabled: settings.archiveMedia,
    importStatus: settings.importStatus,
  });
}

export function createPublishService(token: {
  accessToken: string;
  accountId: string;
}): PublishService {
  return new PublishService({ client: createInstagramClient(token), store: publishStore });
}

export function createSyncService(): SyncService {
  return new SyncService({
    connections: connectionService,
    createImportService: (_auth, token, settings) => createImportService(token, settings),
    revalidate: async (siteId) => {
      // Reuse NextPress's own revalidation endpoint rather than inventing a
      // second caching layer.
      const { revalidateTag } = await import("next/cache");
      revalidateTag(`site:${siteId}:content`);
      revalidateTag(`site:${siteId}:${INSTAGRAM_CONTENT_TYPE}`);
    },
  });
}

/** Resolve the app credentials. Absent config is a clear, actionable error. */
export function getInstagramAppConfig(): {
  appId: string;
  appSecret: string;
  redirectUri: string;
} | null {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) return null;
  return { appId, appSecret, redirectUri };
}

export { IG_FIELDS, INSTAGRAM_CONTENT_TYPE };
