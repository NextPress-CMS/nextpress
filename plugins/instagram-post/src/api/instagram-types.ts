/**
 * Instagram API — wire types and validation schemas.
 *
 * SECURITY: every response from Instagram is parsed through these schemas
 * before it is allowed anywhere near the database or the UI. External JSON is
 * untrusted input, and Meta is free to change field shapes without telling us.
 *
 * Verified against the Instagram Platform docs (Sept 2026):
 *   - Instagram API with Instagram Login
 *   - https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/
 *   - https://developers.facebook.com/docs/instagram-platform/content-publishing
 */

import { z } from "zod";

// ── Media types ──
//
// Only what the current API actually returns. STORIES is publish-only and is
// never returned by /me/media, so it is not part of the archive union.

export const instagramMediaTypeSchema = z.enum(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]);
export type InstagramMediaType = z.infer<typeof instagramMediaTypeSchema>;

export const instagramPublishTypeSchema = z.enum(["IMAGE", "VIDEO", "REELS", "CAROUSEL", "STORIES"]);
export type InstagramPublishType = z.infer<typeof instagramPublishTypeSchema>;

// ── Account ──

export const instagramAccountSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  // account_type is absent for some Business accounts, so it must stay optional.
  account_type: z.string().optional(),
  media_count: z.number().int().nonnegative().optional(),
  name: z.string().optional(),
  profile_picture_url: z.string().url().optional(),
});

export type InstagramAccount = z.infer<typeof instagramAccountSchema>;

// ── Media ──
//
// `media_url` is deliberately OPTIONAL. Meta omits it when the post carries
// copyrighted audio or the account disabled downloads. Treating it as required
// would make the whole import fail on a single such post.

export const instagramMediaChildSchema = z.object({
  id: z.string().min(1),
  media_type: instagramMediaTypeSchema,
  media_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
});

export type InstagramMediaChild = z.infer<typeof instagramMediaChildSchema>;

export const instagramMediaSchema = z.object({
  id: z.string().min(1),
  media_type: instagramMediaTypeSchema,
  media_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
  permalink: z.string().url().optional(),
  caption: z.string().optional(),
  timestamp: z.string().min(1),
  username: z.string().optional(),
  children: z
    .object({ data: z.array(instagramMediaChildSchema) })
    .optional()
    .transform((c) => c?.data),
});

export type InstagramMedia = z.infer<typeof instagramMediaSchema>;

// ── Pagination ──
//
// Cursor paging is the only supported mode for /me/media.

export const instagramPagingSchema = z
  .object({
    cursors: z.object({ before: z.string().optional(), after: z.string().optional() }).optional(),
    next: z.string().url().optional(),
    previous: z.string().url().optional(),
  })
  .optional();

export const instagramMediaPageSchema = z.object({
  data: z.array(instagramMediaSchema),
  paging: instagramPagingSchema,
});

export interface InstagramMediaPage {
  items: InstagramMedia[];
  /** Cursor for the next page, or null when the account has been fully walked. */
  nextCursor: string | null;
}

// ── Publishing ──

export const instagramContainerSchema = z.object({ id: z.string().min(1) });
export type InstagramContainer = z.infer<typeof instagramContainerSchema>;

/**
 * Container processing states. Video containers are processed asynchronously,
 * so a container id is NOT proof of success — it must be polled to FINISHED.
 */
export const instagramContainerStatusSchema = z.object({
  id: z.string().min(1),
  status_code: z.enum(["EXPIRED", "ERROR", "FINISHED", "IN_PROGRESS", "PUBLISHED"]),
  status: z.string().optional(),
});

export type InstagramContainerStatus = z.infer<typeof instagramContainerStatusSchema>;

export const instagramPublishedMediaSchema = z.object({ id: z.string().min(1) });
export type InstagramPublishedMedia = z.infer<typeof instagramPublishedMediaSchema>;

/**
 * Runtime publishing quota.
 *
 * The docs contradict themselves (50 vs 100 posts / 24h), so the plugin never
 * hardcodes a number — it asks the account for its own limit.
 */
export const instagramPublishingLimitSchema = z.object({
  data: z
    .array(
      z.object({
        quota_usage: z.number().int().nonnegative().optional(),
        config: z
          .object({
            quota_total: z.number().int().positive().optional(),
            quota_duration: z.number().int().positive().optional(),
          })
          .optional(),
      }),
    )
    .default([]),
});

export interface InstagramPublishingLimit {
  used: number;
  total: number;
  remaining: number;
}

// ── Publish input (plugin-side, not a wire type) ──

export interface InstagramPublishInput {
  /** Publicly reachable HTTPS URL. Meta fetches this server-side. */
  imageUrl?: string;
  videoUrl?: string;
  mediaType: InstagramPublishType;
  caption?: string;
  /** Images only. Max 1000 characters (docs, Mar 2025). */
  altText?: string;
  /** Child container ids, for CAROUSEL parents. */
  children?: string[];
  /** Marks this container as a carousel item rather than a standalone post. */
  isCarouselItem?: boolean;
}

// ── Token responses ──

export const shortLivedTokenSchema = z.object({
  access_token: z.string().min(1),
  user_id: z.union([z.string(), z.number()]).transform(String),
  permissions: z.union([z.string(), z.array(z.string())]).optional(),
});

export const longLivedTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive(),
});

export type LongLivedToken = z.infer<typeof longLivedTokenSchema>;

// ── Error envelope ──

export const graphErrorSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    type: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    fbtrace_id: z.string().optional(),
    error_user_msg: z.string().optional(),
    error_user_title: z.string().optional(),
  }),
});

// ── Client interface ──
//
// Business logic depends on THIS, never on fetch(). That is what makes the
// services testable without a network and survivable across API changes.

export interface InstagramClient {
  getAccount(): Promise<InstagramAccount>;
  listMedia(cursor?: string, limit?: number): Promise<InstagramMediaPage>;
  getMedia(mediaId: string): Promise<InstagramMedia>;
  createMediaContainer(input: InstagramPublishInput): Promise<InstagramContainer>;
  getContainerStatus(containerId: string): Promise<InstagramContainerStatus>;
  publishContainer(containerId: string): Promise<InstagramPublishedMedia>;
  getPublishingLimit(): Promise<InstagramPublishingLimit>;
}
