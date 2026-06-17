/**
 * Settings Service
 *
 * Key-value settings organized by group.
 *
 * Storage:
 *   Each setting is a row in the `settings` table: (siteId, group, key, value).
 *   The value column is Json — preserves types (numbers, booleans, arrays).
 *
 * Groups:
 *   Core groups: general, reading, writing, discussion, media, permalinks.
 *   Plugins register additional groups via settingsService.registerGroup().
 *   Each group has a list of SettingFieldDef entries that define the admin UI.
 *
 * Resolution:
 *   getSetting(siteId, group, key):
 *     1. Check DB for (siteId, group, key)
 *     2. Fall back to DEFAULT_SETTINGS[group][key]
 *     3. Return undefined if not found
 */

import { prisma } from "@nextpress/db";
import type { AuthContext } from "../auth/auth-types";
import { assertCan } from "../auth/permissions";
import {
  DEFAULT_SETTINGS,
  type SettingsMap,
  type SettingGroup,
  type SettingFieldDef,
  type UpdateSettingsInput,
} from "./settings-types";

// ── Plugin-registered groups ──

const registeredGroups = new Map<string, SettingGroup>();

export const settingsService = {
  // ────────────────────────────────────────────────────────
  // READ
  // ────────────────────────────────────────────────────────

  /** Get all settings for a group, merged with defaults */
  async getGroup(siteId: string, group: string): Promise<SettingsMap> {
    const rows = await prisma.setting.findMany({
      where: { siteId, group },
    });

    // Start with defaults
    const result: SettingsMap = { ...(DEFAULT_SETTINGS[group] ?? {}) };

    // Override with DB values
    for (const row of rows) {
      result[row.key] = row.value;
    }

    return result;
  },

  /** Get a single setting value */
  async get(siteId: string, group: string, key: string): Promise<unknown> {
    const row = await prisma.setting.findUnique({
      where: { siteId_group_key: { siteId, group, key } },
    });
    if (row) return row.value;
    return DEFAULT_SETTINGS[group]?.[key] ?? undefined;
  },

  /** Get all settings for all groups (for the admin settings page) */
  async getAll(siteId: string): Promise<Record<string, SettingsMap>> {
    const result: Record<string, SettingsMap> = {};
    const allGroups = this.getGroups();

    for (const group of allGroups) {
      result[group.slug] = await this.getGroup(siteId, group.slug);
    }

    return result;
  },

  // ────────────────────────────────────────────────────────
  // WRITE
  // ────────────────────────────────────────────────────────

  /** Update settings for a group (bulk upsert) */
  async updateGroup(
    auth: AuthContext,
    input: UpdateSettingsInput,
  ): Promise<SettingsMap> {
    assertCan(auth, "manage_settings");

    const { group, values } = input;

    for (const [key, value] of Object.entries(values)) {
      await prisma.setting.upsert({
        where: {
          siteId_group_key: { siteId: auth.siteId, group, key },
        },
        update: { value: value as any },
        create: {
          siteId: auth.siteId,
          group,
          key,
          value: value as any,
        },
      });
    }

    return this.getGroup(auth.siteId, group);
  },

  /** Set a single setting */
  async set(
    siteId: string,
    group: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    await prisma.setting.upsert({
      where: { siteId_group_key: { siteId, group, key } },
      update: { value: value as any },
      create: { siteId, group, key, value: value as any },
    });
  },

  /** Delete a setting (reverts to default) */
  async delete(siteId: string, group: string, key: string): Promise<void> {
    await prisma.setting.deleteMany({
      where: { siteId, group, key },
    });
  },

  // ────────────────────────────────────────────────────────
  // GROUP MANAGEMENT
  // ────────────────────────────────────────────────────────

  /** Register a settings group (plugins use this) */
  registerGroup(group: SettingGroup): void {
    registeredGroups.set(group.slug, group);
  },

  /** Get all setting groups (built-in + plugin-registered) */
  getGroups(): SettingGroup[] {
    const builtIn: SettingGroup[] = [
      {
        slug: "general", name: "General", source: "core",
        fields: [
          { key: "site_title", label: "Site Title", type: "text", defaultValue: "" },
          { key: "site_tagline", label: "Tagline", type: "text", defaultValue: "" },
          { key: "site_url", label: "Site URL", type: "url", defaultValue: "" },
          { key: "admin_email", label: "Admin Email", type: "email", defaultValue: "" },
          { key: "timezone", label: "Timezone", type: "select", defaultValue: "UTC", options: [
            { label: "UTC", value: "UTC" },
            { label: "US/Eastern", value: "America/New_York" },
            { label: "US/Pacific", value: "America/Los_Angeles" },
            { label: "Europe/London", value: "Europe/London" },
            { label: "Europe/Berlin", value: "Europe/Berlin" },
            { label: "Asia/Tokyo", value: "Asia/Tokyo" },
          ]},
        ],
      },
      {
        slug: "reading", name: "Reading", source: "core",
        fields: [
          { key: "homepage_display", label: "Homepage displays", type: "select", defaultValue: "latest_posts", options: [
            { label: "Latest posts", value: "latest_posts" },
            { label: "A static page", value: "static_page" },
          ]},
          { key: "posts_per_page", label: "Posts per page", type: "number", defaultValue: 10, validation: { min: 1, max: 100 } },
          { key: "feed_items", label: "Feed items", type: "number", defaultValue: 10 },
        ],
      },
      {
        slug: "discussion", name: "Discussion", source: "core",
        fields: [
          { key: "comments_enabled", label: "Allow comments", type: "boolean", defaultValue: true },
          { key: "require_moderation", label: "Require moderation", type: "boolean", defaultValue: true },
          { key: "require_name_email", label: "Require name and email", type: "boolean", defaultValue: true },
          { key: "comment_max_depth", label: "Max reply depth", type: "number", defaultValue: 3, validation: { min: 1, max: 10 } },
          { key: "notify_on_comment", label: "Email on new comment", type: "boolean", defaultValue: true },
        ],
      },
      {
        slug: "permalinks", name: "Permalinks", source: "core",
        fields: [
          { key: "post_structure", label: "Post URL structure", type: "select", defaultValue: "/:slug", description: "Choose how post URLs are structured on your site.", options: [
            { label: "/:slug  —  e.g. /my-post-title", value: "/:slug" },
            { label: "/blog/:slug  —  e.g. /blog/my-post-title", value: "/blog/:slug" },
            { label: "/:year/:month/:slug  —  e.g. /2026/04/my-post-title", value: "/:year/:month/:slug" },
          ]},
          { key: "category_base", label: "Category base", type: "text", defaultValue: "category" },
          { key: "tag_base", label: "Tag base", type: "text", defaultValue: "tag" },
        ],
      },
      {
        slug: "media", name: "Media", description: "Upload limits and image sizes", source: "core",
        fields: [
          { key: "max_upload_size_mb", label: "Max upload size (MB)", type: "number", defaultValue: 50, validation: { min: 1, max: 500 } },
          { key: "thumbnail_width", label: "Thumbnail width (px)", type: "number", defaultValue: 150, validation: { min: 50, max: 1000 } },
          { key: "thumbnail_height", label: "Thumbnail height (px)", type: "number", defaultValue: 150, validation: { min: 50, max: 1000 } },
          { key: "medium_width", label: "Medium size width (px)", type: "number", defaultValue: 768, validation: { min: 100, max: 3000 } },
          { key: "large_width", label: "Large size width (px)", type: "number", defaultValue: 1200, validation: { min: 200, max: 5000 } },
        ],
      },
    ];

    return [...builtIn, ...Array.from(registeredGroups.values())];
  },

  /** Get a single group definition */
  getGroup_def(slug: string): SettingGroup | undefined {
    return this.getGroups().find((g) => g.slug === slug);
  },
};
