import "server-only";

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

/**
 * Skin packs — user-uploaded "themes" that override CSS and static
 * assets without shipping React component code. They live under
 * `apps/web/public/skins/<slug>/` so Next.js serves them as static
 * files, and they reuse the base (blockchainist) layout and templates.
 *
 * Structure:
 *   public/skins/<slug>/
 *     theme.json        (required — manifest)
 *     styles/theme.css  (required — the stylesheet)
 *     <any assets>
 */

const SKINS_DIR = join(process.cwd(), "public", "skins");

export interface SkinManifest {
  name: string;
  slug: string;
  version: string;
  description?: string;
  author?: string;
}

export interface DiscoveredSkin {
  slug: string;
  manifest: SkinManifest;
  cssUrl: string;
}

export function listSkins(): DiscoveredSkin[] {
  if (!existsSync(SKINS_DIR)) return [];

  const entries = readdirSync(SKINS_DIR, { withFileTypes: true });
  const skins: DiscoveredSkin[] = [];

  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const dirName = dirent.name;
    const manifestPath = join(SKINS_DIR, dirName, "theme.json");
    const cssPath = join(SKINS_DIR, dirName, "styles", "theme.css");

    if (!existsSync(manifestPath)) continue;
    if (!existsSync(cssPath)) continue;

    try {
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8")) as Partial<SkinManifest>;
      if (!raw.slug || !raw.name || !raw.version) continue;
      if (!/^[a-z0-9-]+$/.test(raw.slug)) continue;
      // dir name must match slug
      if (raw.slug !== dirName) continue;

      skins.push({
        slug: raw.slug,
        manifest: {
          slug: raw.slug,
          name: raw.name,
          version: raw.version,
          description: raw.description,
          author: raw.author,
        },
        cssUrl: `/skins/${raw.slug}/styles/theme.css`,
      });
    } catch {
      // Ignore broken manifests
    }
  }

  return skins;
}

export function getSkin(slug: string): DiscoveredSkin | null {
  return listSkins().find((s) => s.slug === slug) ?? null;
}

export function skinSize(slug: string): number {
  const dir = join(SKINS_DIR, slug);
  if (!existsSync(dir)) return 0;
  let total = 0;
  const walk = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) total += statSync(full).size;
    }
  };
  walk(dir);
  return total;
}
