/**
 * Menu Service
 *
 * Manages navigation menus with nested items.
 *
 * Menus are assigned to theme-defined locations (e.g., "primary", "footer").
 * Each location has at most one menu.
 *
 * Menu items can link to:
 *   - Custom URLs (type: "custom")
 *   - Content entries (type: "content", objectId → contentEntryId)
 *   - Taxonomy terms (type: "taxonomy", objectId → termId)
 *
 * Save strategy:
 *   The admin sends the COMPLETE menu state on save.
 *   The service deletes all existing items and recreates them.
 *   This avoids complex diffing and handles reordering + reparenting cleanly.
 *
 * URL resolution:
 *   For content/taxonomy items, the resolvedUrl is computed at read time
 *   by joining with the content_entries/terms tables. This means URLs
 *   stay current when slugs change.
 */

import { prisma } from "@nextpress/db";
import type { AuthContext } from "../auth/auth-types";
import { assertCan } from "../auth/permissions";
import { NotFoundError } from "../errors/cms-error";
import {
  saveMenuSchema,
  type SaveMenuInput,
  type MenuDto,
  type MenuItemDto,
  type MenuItemInput,
} from "./menu-types";

export const menuService = {
  /** Get a menu by location, with resolved URLs and nested tree */
  async getByLocation(
    siteId: string,
    location: string,
  ): Promise<MenuDto | null> {
    const menu = await prisma.menu.findUnique({
      where: { siteId_location: { siteId, location } },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!menu) return null;

    // Resolve URLs for content and taxonomy items
    const items = await resolveItemUrls(menu.items);

    // Build tree from flat list
    const tree = buildMenuTree(items);

    return {
      id: menu.id,
      siteId: menu.siteId,
      name: menu.name,
      location: menu.location,
      items: tree,
    };
  },

  /** Get all menus for a site */
  async list(siteId: string): Promise<MenuDto[]> {
    const menus = await prisma.menu.findMany({
      where: { siteId },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
      },
    });

    const result: MenuDto[] = [];
    for (const menu of menus) {
      const items = await resolveItemUrls(menu.items);
      result.push({
        id: menu.id,
        siteId: menu.siteId,
        name: menu.name,
        location: menu.location,
        items: buildMenuTree(items),
      });
    }

    return result;
  },

  /**
   * Save a menu (create or replace).
   * Deletes all existing items for the location and recreates them.
   */
  async save(
    auth: AuthContext,
    input: SaveMenuInput,
  ): Promise<MenuDto> {
    assertCan(auth, "manage_menus");
    const data = saveMenuSchema.parse(input);

    // One transaction: the delete-then-recreate must never leave a menu
    // empty or half-built if a later write fails.
    await prisma.$transaction(async (tx) => {
      // Upsert the menu
      const menu = await tx.menu.upsert({
        where: {
          siteId_location: { siteId: auth.siteId, location: data.location },
        },
        update: { name: data.name },
        create: {
          siteId: auth.siteId,
          name: data.name,
          location: data.location,
        },
      });
  
      // Delete all existing items
      await tx.menuItem.deleteMany({ where: { menuId: menu.id } });
  
      // Create new items (handle temp IDs for parent references)
      const idMap = new Map<string, string>(); // tempId → realId
  
      // First pass: create all items without parentId
      for (const item of data.items) {
        const created = await tx.menuItem.create({
          data: {
            menuId: menu.id,
            label: item.label,
            url: item.type === "custom" ? item.url : null,
            type: item.type,
            objectId: item.objectId ?? null,
            sortOrder: item.sortOrder,
            cssClass: item.cssClass ?? null,
            openInNewTab: item.openInNewTab,
            // parentId set in second pass
          },
        });
  
        if (item.id) {
          idMap.set(item.id, created.id);
        }
      }
  
      // Second pass: set parent IDs
      for (const item of data.items) {
        if (item.parentId && item.id) {
          const realId = idMap.get(item.id);
          const realParentId = idMap.get(item.parentId);
          if (realId && realParentId) {
            await tx.menuItem.update({
              where: { id: realId },
              data: { parentId: realParentId },
            });
          }
        }
      }
  
      });

    return (await this.getByLocation(auth.siteId, data.location))!;
  },

  /** Delete a menu and all its items */
  async delete(auth: AuthContext, location: string): Promise<void> {
    assertCan(auth, "manage_menus");

    const menu = await prisma.menu.findUnique({
      where: { siteId_location: { siteId: auth.siteId, location } },
    });
    if (!menu) throw new NotFoundError("Menu", location);

    await prisma.menu.delete({ where: { id: menu.id } });
  },

  /** Get available menu locations from the active theme */
  async getLocations(siteId: string): Promise<Array<{ slug: string; name: string; hasMenu: boolean }>> {
    // Get theme-declared locations
    const themeInstall = await prisma.themeInstall.findFirst({
      where: { siteId, isActive: true },
    });

    // Default locations if no theme
    const locations = [
      { slug: "primary", name: "Primary Navigation" },
      { slug: "footer", name: "Footer Navigation" },
    ];

    // Check which locations have menus assigned
    const menus = await prisma.menu.findMany({
      where: { siteId },
      select: { location: true },
    });
    const menuLocations = new Set(menus.map((m) => m.location));

    return locations.map((loc) => ({
      ...loc,
      hasMenu: menuLocations.has(loc.slug),
    }));
  },
};

// ── Helpers ──

/** Resolve URLs for content and taxonomy menu items — batched to avoid N+1 */
async function resolveItemUrls(
  items: Array<{
    id: string;
    label: string;
    url: string | null;
    type: string;
    objectId: string | null;
    parentId: string | null;
    sortOrder: number;
    cssClass: string | null;
    openInNewTab: boolean;
  }>,
): Promise<MenuItemDto[]> {
  // Collect all object IDs by type for batch resolution
  const contentIds = items.filter((i) => i.type === "content" && i.objectId).map((i) => i.objectId!);
  const termIds = items.filter((i) => i.type === "taxonomy" && i.objectId).map((i) => i.objectId!);

  // Batch queries (2 queries instead of N)
  const contentMap = new Map<string, string>();
  if (contentIds.length > 0) {
    const entries = await prisma.contentEntry.findMany({
      where: { id: { in: contentIds } },
      select: { id: true, slug: true },
    });
    for (const e of entries) contentMap.set(e.id, `/${e.slug}`);
  }

  const termMap = new Map<string, string>();
  if (termIds.length > 0) {
    const terms = await prisma.term.findMany({
      where: { id: { in: termIds } },
      select: { id: true, slug: true, taxonomy: { select: { slug: true } } },
    });
    for (const t of terms) termMap.set(t.id, `/${t.taxonomy.slug}/${t.slug}`);
  }

  return items.map((item) => {
    let resolvedUrl: string | null = null;
    if (item.type === "custom") resolvedUrl = item.url;
    else if (item.type === "content" && item.objectId) resolvedUrl = contentMap.get(item.objectId) ?? null;
    else if (item.type === "taxonomy" && item.objectId) resolvedUrl = termMap.get(item.objectId) ?? null;

    return {
      id: item.id,
      label: item.label,
      url: item.url,
      type: item.type as MenuItemDto["type"],
      objectId: item.objectId,
      parentId: item.parentId,
      sortOrder: item.sortOrder,
      cssClass: item.cssClass,
      openInNewTab: item.openInNewTab,
      resolvedUrl,
      children: [],
    };
  });
}

/** Build nested tree from flat item list */
function buildMenuTree(items: MenuItemDto[]): MenuItemDto[] {
  const map = new Map<string, MenuItemDto>();
  const roots: MenuItemDto[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
