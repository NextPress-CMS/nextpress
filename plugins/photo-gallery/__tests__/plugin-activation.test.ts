import { describe, it, expect, vi, beforeEach } from "vitest";

// plugin-context.ts imports prisma from @nextpress/db (for taxonomies).
// We never touch taxonomies here, but the import must resolve.
vi.mock("@nextpress/db", () => ({ prisma: {} }));

import plugin from "../index";
import { photoGalleryDefaults, PHOTO_GALLERY_BLOCK_TYPE } from "../lib/schema";
import { getBlockDefinition, validateBlockAttributes } from "@nextpress/blocks";
import { PluginContext } from "@nextpress/core/plugin/plugin-context";
import type { AuthContext } from "@nextpress/core/auth/auth-types";

const adminAuth: AuthContext = {
  user: { id: "u1", email: "admin@test.com", name: "Admin", displayName: "Admin", image: null },
  siteId: "site-1",
  role: "admin",
  permissions: new Set(["read"]),
};

let ctx: PluginContext;

beforeEach(() => {
  ctx = new PluginContext("photo-gallery", adminAuth);
});

describe("photo-gallery plugin activation", () => {
  it("has the expected plugin definition shape", () => {
    expect(plugin.slug).toBe("photo-gallery");
    expect(typeof plugin.onActivate).toBe("function");
    expect(typeof plugin.onDeactivate).toBe("function");
  });

  it("registers the gallery block on activation", async () => {
    await plugin.onActivate(ctx);

    const def = getBlockDefinition(PHOTO_GALLERY_BLOCK_TYPE);
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.category).toBe("media");
    expect(def.version).toBe(1);
    expect(def.allowsInnerBlocks).toBe(false);
    expect(def.source).toBe("photo-gallery");
    expect(typeof def.renderComponent).toBe("function");
  });

  it("validates the default attributes against the registered schema", async () => {
    await plugin.onActivate(ctx);
    const result = validateBlockAttributes(PHOTO_GALLERY_BLOCK_TYPE, photoGalleryDefaults);
    expect(result.valid).toBe(true);
  });

  it("unregisters the block on deactivation", async () => {
    await plugin.onActivate(ctx);
    expect(getBlockDefinition(PHOTO_GALLERY_BLOCK_TYPE)).toBeDefined();

    await plugin.onDeactivate?.(ctx);
    expect(getBlockDefinition(PHOTO_GALLERY_BLOCK_TYPE)).toBeUndefined();
  });
});
