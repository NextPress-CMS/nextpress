/**
 * Theme Manager
 *
 * Discovers themes on disk, loads the active theme, and exposes
 * it to the rendering pipeline.
 *
 * Lifecycle:
 *   1. DISCOVER: Scan themes/ directory for theme.json manifests
 *   2. LOAD: Import the active theme's layout, templates, block overrides
 *   3. ACTIVATE: Register block overrides, cache templates
 *   4. RENDER: Template resolver picks the right template per request
 *
 * The theme manager is a SINGLETON initialized once at server startup.
 * It holds the loaded theme in memory. Theme switching requires a
 * server restart in production (or cache invalidation in dev).
 *
 * This is intentional: themes are not hot-swappable in production
 * because they contain compiled React components that are part of
 * the server bundle. Same constraint as Next.js layouts.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { prisma } from "@nextpress/db";
import { overrideRenderComponent } from "@nextpress/blocks";
import {
  themeManifestSchema,
  type ThemeManifest,
  type LoadedTheme,
  type DiscoveredTheme,
  type TemplateComponent,
} from "./theme-types";

// ── Singleton state ──

let activeTheme: LoadedTheme | null = null;
let discoveredThemes: DiscoveredTheme[] = [];

/**
 * Pre-registered themes (statically imported for bundler compatibility).
 * Use registerTheme() to add themes before the manager tries dynamic import.
 */
const preRegistered = new Map<string, LoadedTheme>();

/** Register a pre-bundled theme (call from app startup) */
export function registerTheme(slug: string, theme: LoadedTheme) {
  preRegistered.set(slug, theme);
}

// ── Theme directory ──

const THEMES_DIR = join(process.cwd(), "../../themes");

// ── Public API ──

export const themeManager = {
  /**
   * Discover all themes in the themes/ directory.
   * Reads theme.json from each subdirectory.
   */
  discover(): DiscoveredTheme[] {
    const themesDir = resolveThemesDir();
    if (!existsSync(themesDir)) return [];

    const dirs = readdirSync(themesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name);

    discoveredThemes = [];

    for (const dir of dirs) {
      const manifestPath = join(themesDir, dir, "theme.json");
      if (!existsSync(manifestPath)) continue;

      try {
        const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
        const manifest = themeManifestSchema.parse(raw);
        discoveredThemes.push({
          slug: dir,
          manifest,
          dirPath: join(themesDir, dir),
        });
      } catch (e) {
        console.warn(`Invalid theme.json in themes/${dir}:`, e);
      }
    }

    return discoveredThemes;
  },

  /** Get all discovered themes */
  getDiscovered(): DiscoveredTheme[] {
    if (discoveredThemes.length === 0) this.discover();
    return discoveredThemes;
  },

  /**
   * Load and activate a theme by slug.
   *
   * This is called once at startup (or on theme switch).
   * It imports the theme's modules and registers block overrides.
   *
   * In production, this runs during the Next.js build/startup.
   * In development, it runs on first request and on HMR.
   */
  async load(slug: string): Promise<LoadedTheme> {
    // Check for pre-registered (statically bundled) themes first
    const preReg = preRegistered.get(slug);
    if (preReg) {
      activeTheme = preReg;
      return activeTheme;
    }

    const discovered = this.getDiscovered().find((t) => t.slug === slug);
    if (!discovered) {
      throw new Error(`Theme not found: ${slug}`);
    }

    const { manifest, dirPath } = discovered;

    // Load templates
    const templates = new Map<string, TemplateComponent>();
    const templatesDir = join(dirPath, "templates");
    if (existsSync(templatesDir)) {
      const files = readdirSync(templatesDir).filter((f) => f.endsWith(".tsx"));
      for (const file of files) {
        const templateSlug = file.replace(".tsx", "");
        try {
          const mod = await import(join(templatesDir, file));
          const firstKey = Object.keys(mod)[0] as string | undefined;
          const component = mod.default || (firstKey && mod[firstKey]);
          if (component) {
            templates.set(templateSlug, component);
          }
        } catch (e) {
          console.warn(`Failed to load template ${templateSlug} from theme ${slug}:`, e);
        }
      }
    }

    // Load layout
    let layout: LoadedTheme["layout"];
    const layoutPath = join(dirPath, "layout.tsx");
    if (existsSync(layoutPath)) {
      try {
        const mod = await import(layoutPath);
        layout = mod.default || mod.ThemeLayout;
      } catch {
        layout = DefaultLayout;
      }
    } else {
      layout = DefaultLayout;
    }

    // Load block overrides
    const blockOverrides = new Map<string, any>();
    const blocksDir = join(dirPath, "blocks");
    if (existsSync(blocksDir)) {
      const files = readdirSync(blocksDir).filter((f) => f.endsWith(".tsx"));
      for (const file of files) {
        const blockSlug = file.replace(".tsx", "");
        const blockType = `core/${blockSlug}`;
        try {
          const mod = await import(join(blocksDir, file));
          const blockFirstKey = Object.keys(mod)[0] as string | undefined;
          const component = mod.default || (blockFirstKey && mod[blockFirstKey]);
          if (component) {
            blockOverrides.set(blockType, component);
            // Register the override in the block registry
            overrideRenderComponent(blockType, component);
          }
        } catch (e) {
          console.warn(`Failed to load block override ${blockType} from theme ${slug}:`, e);
        }
      }
    }

    // CSS path
    const cssPath = existsSync(join(dirPath, "styles/theme.css"))
      ? "styles/theme.css"
      : null;

    activeTheme = {
      manifest,
      templates,
      layout,
      blockOverrides,
      cssPath,
    };

    return activeTheme;
  },

  /**
   * Get the currently active theme for a site.
   * If no theme is loaded, loads the active one from the DB.
   */
  async getActive(siteId: string): Promise<LoadedTheme> {
    if (activeTheme) return activeTheme;

    // Find active theme in DB
    const install = await prisma.themeInstall.findFirst({
      where: { siteId, isActive: true },
    });

    const slug = install?.slug ?? "default";
    return this.load(slug);
  },

  /** Get the loaded active theme (returns null if not yet loaded) */
  getCurrent(): LoadedTheme | null {
    return activeTheme;
  },

  /** Clear the loaded theme (for dev mode / theme switching) */
  reset(): void {
    activeTheme = null;
  },
};

// ── Helpers ──

function resolveThemesDir(): string {
  // Try relative to CWD first (monorepo root), then up from apps/web
  if (existsSync(join(process.cwd(), "themes"))) {
    return join(process.cwd(), "themes");
  }
  return THEMES_DIR;
}

function DefaultLayout({ children }: { children: React.ReactNode }) {
  return children;
}
