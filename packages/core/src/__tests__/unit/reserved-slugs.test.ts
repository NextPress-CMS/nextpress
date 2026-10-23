import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { RESERVED_ROUTE_SLUGS, routeSlugSchema } from "../../validation/schemas";
import { createContentTypeSchema } from "../../content-type/content-type-types";
import { createTaxonomySchema } from "../../taxonomy/taxonomy-types";

const base = { nameSingular: "Thing", namePlural: "Things" };

describe("reserved route slugs", () => {
  it.each(["media", "users", "settings", "posts", "api", "search"])(
    "rejects content type slug %s",
    (slug) => {
      const r = createContentTypeSchema.safeParse({ ...base, slug });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toMatch(/reserved/);
    },
  );

  it("rejects reserved taxonomy slugs", () => {
    expect(createTaxonomySchema.safeParse({ slug: "search", name: "Search" }).success).toBe(false);
  });

  it("accepts ordinary slugs, including ones that merely contain a reserved word", () => {
    for (const slug of ["recipe", "media-kit", "user-stories", "page"]) {
      expect(routeSlugSchema.safeParse(slug).success).toBe(true);
    }
  });

  // Guards the list against drift: every static /admin/<segment> route must be reserved.
  it("covers every static admin route segment", () => {
    const adminDir = join(__dirname, "../../../../../apps/web/app/(admin)/admin");
    const segments = readdirSync(adminDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("("))
      .map((d) => d.name);
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) expect(RESERVED_ROUTE_SLUGS.has(s), `missing reserved slug: ${s}`).toBe(true);
  });
});
