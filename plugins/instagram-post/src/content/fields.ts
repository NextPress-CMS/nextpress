/**
 * Instagram custom fields.
 *
 * These are registered through `ctx.content.registerFields()` and stored as
 * NextPress FieldValues — no bespoke tables. Two field groups exist:
 *
 *   `instagram-archive`   metadata about an IMPORTED post (Instagram → site)
 *   `instagram-publish`   intent and result of PUBLISHING (site → Instagram)
 *
 * Only genuinely Instagram-specific data lives here. Title, slug, excerpt,
 * publish date, and media all use native NextPress fields, so imported posts
 * behave like ordinary content in search, SEO, sitemaps, and the editor.
 *
 * Raw API payloads are deliberately NOT persisted: they add storage cost,
 * become stale, and would park expiring CDN URLs in the database forever.
 */

import type { z } from "zod";
import {
  createFieldDefinitionSchema,
  type CreateFieldDefinitionInput,
} from "@nextpress/core/fields/field-types";

/**
 * INPUT type, not the inferred output type.
 *
 * `CreateFieldDefinitionInput` is `z.infer`, so schema defaults (isRequired,
 * group, sortOrder) appear as REQUIRED properties. These declarations are
 * pre-validation input, where omitting them is exactly the point — `z.input`
 * models that. `normalizeFields()` applies the defaults before registration.
 */
type FieldDefinitionInput = z.input<typeof createFieldDefinitionSchema>;

/**
 * Apply schema defaults so declarations satisfy the registration API.
 *
 * Using the real schema (rather than hand-writing the defaults) means these
 * field definitions cannot drift from what the field service actually accepts.
 */
export function normalizeFields(
  fields: FieldDefinitionInput[],
): CreateFieldDefinitionInput[] {
  return fields.map((field) => createFieldDefinitionSchema.parse(field));
}

/** Field keys. Referenced everywhere instead of string literals. */
export const IG_FIELDS = {
  /** Stable external identity. The join key for the whole plugin. */
  mediaId: "instagram_media_id",
  accountId: "instagram_account_id",
  username: "instagram_username",
  permalink: "instagram_permalink",
  mediaType: "instagram_media_type",
  timestamp: "instagram_timestamp",
  caption: "instagram_caption",

  /** Import state machine. */
  syncStatus: "instagram_sync_status",
  lastSyncedAt: "instagram_last_synced_at",
  lastError: "instagram_last_error",
  retryCount: "instagram_retry_count",

  /** Provenance: imported from Instagram, or authored in NextPress. */
  source: "instagram_source",

  /** Publishing (site → Instagram). */
  publishEnabled: "instagram_publish_enabled",
  publishCaption: "instagram_publish_caption",
  publishMediaId: "instagram_publish_media_id",
  publishStatus: "instagram_publish_status",
  publishContainerId: "instagram_publish_container_id",
  publishedAt: "instagram_published_at",
  publishError: "instagram_publish_error",
  publishRetryCount: "instagram_publish_retry_count",
} as const;

export const ARCHIVE_FIELD_GROUP = "instagram-archive";
export const PUBLISH_FIELD_GROUP = "instagram-publish";

/**
 * Fields describing an imported Instagram post.
 * Attached to the `instagram-post` content type only.
 */
export const ARCHIVE_FIELDS: FieldDefinitionInput[] = [
  {
    key: IG_FIELDS.mediaId,
    name: "Instagram Media ID",
    description: "Stable Instagram identifier. Used to prevent duplicate imports.",
    fieldType: "TEXT",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 0,
    isRequired: false,
    validation: { maxLength: 100 },
  },
  {
    key: IG_FIELDS.accountId,
    name: "Instagram Account ID",
    fieldType: "TEXT",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 1,
    validation: { maxLength: 100 },
  },
  {
    key: IG_FIELDS.username,
    name: "Instagram Username",
    fieldType: "TEXT",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 2,
    validation: { maxLength: 100 },
  },
  {
    key: IG_FIELDS.permalink,
    name: "Instagram Permalink",
    description: "Canonical link back to the original post on Instagram.",
    fieldType: "URL",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 3,
  },
  {
    key: IG_FIELDS.mediaType,
    name: "Media Type",
    fieldType: "SELECT",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 4,
    options: [
      { label: "Image", value: "IMAGE" },
      { label: "Video", value: "VIDEO" },
      { label: "Carousel", value: "CAROUSEL_ALBUM" },
    ],
  },
  {
    key: IG_FIELDS.timestamp,
    name: "Instagram Timestamp",
    description: "When the post was originally published on Instagram.",
    fieldType: "DATETIME",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 5,
  },
  {
    key: IG_FIELDS.caption,
    name: "Original Caption",
    description: "The caption exactly as published on Instagram.",
    fieldType: "TEXTAREA",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 6,
  },
  {
    key: IG_FIELDS.syncStatus,
    name: "Sync Status",
    fieldType: "TEXT",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 7,
    defaultValue: "NOT_IMPORTED",
    validation: { maxLength: 40 },
  },
  {
    key: IG_FIELDS.lastSyncedAt,
    name: "Last Synchronised",
    fieldType: "DATETIME",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 8,
  },
  {
    key: IG_FIELDS.lastError,
    name: "Last Sync Error",
    fieldType: "TEXTAREA",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 9,
  },
  {
    key: IG_FIELDS.retryCount,
    name: "Retry Count",
    fieldType: "NUMBER",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 10,
    defaultValue: 0,
  },
  {
    key: IG_FIELDS.source,
    name: "Source",
    description: "Whether this entry was imported from Instagram or authored here.",
    fieldType: "SELECT",
    group: ARCHIVE_FIELD_GROUP,
    sortOrder: 11,
    defaultValue: "instagram",
    options: [
      { label: "Imported from Instagram", value: "instagram" },
      { label: "Created in NextPress", value: "nextpress" },
    ],
  },
];

/**
 * Publishing fields, registered on ordinary content types (post/page) so the
 * existing editor gains Instagram publishing without a separate editor.
 */
export const PUBLISH_FIELDS: FieldDefinitionInput[] = [
  {
    key: IG_FIELDS.publishEnabled,
    name: "Publish to Instagram",
    description: "Publish this entry to the connected Instagram account when it goes live.",
    fieldType: "BOOLEAN",
    group: PUBLISH_FIELD_GROUP,
    sortOrder: 0,
    defaultValue: false,
  },
  {
    key: IG_FIELDS.publishCaption,
    name: "Instagram Caption",
    description:
      "Caption used on Instagram. A website article and an Instagram post rarely share the same copy.",
    fieldType: "TEXTAREA",
    group: PUBLISH_FIELD_GROUP,
    sortOrder: 1,
    // Instagram's documented caption ceiling.
    validation: { maxLength: 2200 },
  },
  {
    key: IG_FIELDS.publishMediaId,
    name: "Published Instagram Media ID",
    description: "Set automatically once Instagram accepts the post.",
    fieldType: "TEXT",
    group: PUBLISH_FIELD_GROUP,
    sortOrder: 2,
    validation: { maxLength: 100 },
  },
  {
    key: IG_FIELDS.publishStatus,
    name: "Instagram Publish Status",
    fieldType: "TEXT",
    group: PUBLISH_FIELD_GROUP,
    sortOrder: 3,
    defaultValue: "NOT_PUBLISHED",
    validation: { maxLength: 40 },
  },
  {
    key: IG_FIELDS.publishContainerId,
    name: "Publish Container ID",
    description:
      "Instagram container id, stored before publishing so an ambiguous response can be reconciled instead of retried blindly.",
    fieldType: "TEXT",
    group: PUBLISH_FIELD_GROUP,
    sortOrder: 4,
    validation: { maxLength: 100 },
  },
  {
    key: IG_FIELDS.publishedAt,
    name: "Published to Instagram At",
    fieldType: "DATETIME",
    group: PUBLISH_FIELD_GROUP,
    sortOrder: 5,
  },
  {
    key: IG_FIELDS.publishError,
    name: "Instagram Publish Error",
    fieldType: "TEXTAREA",
    group: PUBLISH_FIELD_GROUP,
    sortOrder: 6,
  },
  {
    key: IG_FIELDS.publishRetryCount,
    name: "Publish Retry Count",
    fieldType: "NUMBER",
    group: PUBLISH_FIELD_GROUP,
    sortOrder: 7,
    defaultValue: 0,
  },
];

/** Content types that receive the publishing fields. */
export const PUBLISHABLE_CONTENT_TYPES = ["post", "page"] as const;
