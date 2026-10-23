/**
 * Plugin Manager
 *
 * Discovers plugins on disk, manages their lifecycle, and coordinates
 * activation/deactivation.
 *
 * Lifecycle:
 *   1. DISCOVER: Scan plugins/ directory for plugin.json manifests
 *   2. LOAD: Import the plugin's index.ts, get PluginDefinition
 *   3. ACTIVATE: Create PluginContext, call onActivate(), save state to DB
 *   4. DEACTIVATE: Call onDeactivate(), remove hooks by source, update DB
 *   5. UNINSTALL: Call onUninstall(), remove DB records
 *
 * At server startup, all plugins with isActive=true in DB are activated.
 * The activation order respects dependencies (topological sort).
 *
 * Safety:
 *   - Plugins interact only through PluginContext (no raw Prisma)
 *   - All registrations are source-tagged for clean deactivation
 *   - Errors in one plugin don't prevent others from loading
 *   - Dependencies are validated before activation
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { prisma } from "@nextpress/db";
import { hooks } from "../hooks/hook-engine";
import type { AuthContext } from "../auth/auth-types";
import { PluginContext } from "./plugin-context";
import {
  pluginManifestSchema,
  type PluginManifest,
  type PluginDefinition,
  type DiscoveredPlugin,
  type PluginState,
} from "./plugin-types";

// ── Singleton state ──

const loadedPlugins = new Map<string, {
  manifest: PluginManifest;
  definition: PluginDefinition;
  context: PluginContext;
}>();

let discoveredPlugins: DiscoveredPlugin[] = [];

// ── Public API ──

export const pluginManager = {
  /**
   * Discover all plugins in the plugins/ directory.
   */
  discover(): DiscoveredPlugin[] {
    const pluginsDir = resolvePluginsDir();
    if (!existsSync(pluginsDir)) return [];

    const dirs = readdirSync(pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
      .map((d) => d.name);

    discoveredPlugins = [];

    for (const dir of dirs) {
      const manifestPath = join(pluginsDir, dir, "plugin.json");
      if (!existsSync(manifestPath)) continue;

      try {
        const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
        const manifest = pluginManifestSchema.parse(raw);
        discoveredPlugins.push({
          slug: dir,
          manifest,
          dirPath: join(pluginsDir, dir),
        });
      } catch (e) {
        console.warn(`[Plugin] Invalid plugin.json in plugins/${dir}:`, e);
      }
    }

    return discoveredPlugins;
  },

  /** Get all discovered plugins */
  getDiscovered(): DiscoveredPlugin[] {
    if (discoveredPlugins.length === 0) this.discover();
    return discoveredPlugins;
  },

  /**
   * Activate a plugin for a site.
   *
   * 1. Validate manifest and dependencies
   * 2. Import the plugin module
   * 3. Create PluginContext
   * 4. Call onActivate()
   * 5. Register permissions in DB
   * 6. Update PluginInstall record
   */
  async activate(slug: string, auth: AuthContext): Promise<void> {
    const discovered = this.getDiscovered().find((p) => p.slug === slug);
    if (!discovered) throw new Error(`Plugin not found: ${slug}`);

    // Check dependencies
    for (const dep of discovered.manifest.dependencies) {
      const depLoaded = loadedPlugins.has(dep);
      if (!depLoaded) {
        const depInstall = await prisma.pluginInstall.findFirst({
          where: { slug: dep, siteId: auth.siteId, isActive: true },
        });
        if (!depInstall) {
          throw new Error(`Plugin "${slug}" requires "${dep}" to be active`);
        }
      }
    }

    // Import the plugin module
    const mod = await import(join(discovered.dirPath, "index.ts"));
    const definition: PluginDefinition = mod.default || mod;

    if (!definition.onActivate) {
      throw new Error(`Plugin "${slug}" has no onActivate export`);
    }

    // Create context and activate
    const context = new PluginContext(slug, auth);

    try {
      await definition.onActivate(context);
    } catch (e) {
      console.error(`[Plugin] Error activating "${slug}":`, e);
      // Clean up any partial registrations
      hooks.removeBySource(slug);
      throw e;
    }

    // Register custom permissions in DB
    if (discovered.manifest.permissions.length > 0) {
      for (const perm of discovered.manifest.permissions) {
        await prisma.permission.upsert({
          where: { slug: perm.slug },
          update: { name: perm.name, description: perm.description, group: perm.group },
          create: {
            slug: perm.slug,
            name: perm.name,
            description: perm.description ?? null,
            group: perm.group,
          },
        });
      }
    }

    // Update DB state
    await prisma.pluginInstall.upsert({
      where: { siteId_slug: { siteId: auth.siteId, slug } },
      update: {
        isActive: true,
        version: discovered.manifest.version,
        activatedAt: new Date(),
        permissions: discovered.manifest.permissions.map((p) => p.slug),
      },
      create: {
        siteId: auth.siteId,
        slug,
        version: discovered.manifest.version,
        isActive: true,
        activatedAt: new Date(),
        permissions: discovered.manifest.permissions.map((p) => p.slug),
      },
    });

    loadedPlugins.set(slug, { manifest: discovered.manifest, definition, context });
    console.log(`[Plugin] Activated: ${slug}`);
  },

  /**
   * Deactivate a plugin for a site.
   * Removes hooks, calls onDeactivate(), updates DB.
   */
  async deactivate(slug: string, auth: AuthContext): Promise<void> {
    const loaded = loadedPlugins.get(slug);

    if (loaded?.definition.onDeactivate) {
      try {
        await loaded.definition.onDeactivate(loaded.context);
      } catch (e) {
        console.warn(`[Plugin] Error in onDeactivate for "${slug}":`, e);
      }
    }

    // Remove all hooks registered by this plugin
    hooks.removeBySource(slug);

    // Check if other plugins depend on this one
    for (const [otherSlug, other] of loadedPlugins) {
      if (other.manifest.dependencies.includes(slug)) {
        console.warn(
          `[Plugin] Warning: "${otherSlug}" depends on "${slug}". It may malfunction.`,
        );
      }
    }

    // Update DB
    await prisma.pluginInstall.updateMany({
      where: { slug, siteId: auth.siteId },
      data: { isActive: false },
    });

    loadedPlugins.delete(slug);
    console.log(`[Plugin] Deactivated: ${slug}`);
  },

  /**
   * Uninstall a plugin. Calls onUninstall(), removes DB records.
   */
  async uninstall(slug: string, auth: AuthContext): Promise<void> {
    // Deactivate first if still active
    if (loadedPlugins.has(slug)) {
      await this.deactivate(slug, auth);
    }

    const discovered = this.getDiscovered().find((p) => p.slug === slug);
    if (discovered) {
      try {
        const mod = await import(join(discovered.dirPath, "index.ts"));
        const definition: PluginDefinition = mod.default || mod;
        if (definition.onUninstall) {
          const context = new PluginContext(slug, auth);
          await definition.onUninstall(context);
        }
      } catch (e) {
        console.warn(`[Plugin] Error in onUninstall for "${slug}":`, e);
      }
    }

    // Remove plugin permissions
    const install = await prisma.pluginInstall.findFirst({
      where: { slug, siteId: auth.siteId },
      select: { permissions: true },
    });
    if (install?.permissions?.length) {
      await prisma.permission.deleteMany({
        where: { slug: { in: install.permissions } },
      });
    }

    // Remove DB record
    await prisma.pluginInstall.deleteMany({
      where: { slug, siteId: auth.siteId },
    });

    console.log(`[Plugin] Uninstalled: ${slug}`);
  },

  /**
   * Boot all active plugins for a site.
   * Called once at server startup.
   */
  async bootActivePlugins(auth: AuthContext): Promise<void> {
    const installs = await prisma.pluginInstall.findMany({
      where: { siteId: auth.siteId, isActive: true },
      orderBy: { activatedAt: "asc" },
    });

    // Topological sort by dependencies
    const sorted = topologicalSort(
      installs.map((i) => i.slug),
      this.getDiscovered(),
    );

    for (const slug of sorted) {
      try {
        await this.activate(slug, auth);
      } catch (e) {
        console.error(`[Plugin] Failed to boot "${slug}":`, e);
        // Continue booting other plugins
      }
    }
  },

  /** Get the loaded plugin context (for admin pages, API routes) */
  getLoaded(slug: string) {
    return loadedPlugins.get(slug);
  },

  /** Get all loaded plugins */
  getAllLoaded() {
    return Array.from(loadedPlugins.entries()).map(([slug, p]) => ({
      slug,
      manifest: p.manifest,
    }));
  },

  /** Get plugin state from DB */
  async getState(siteId: string): Promise<PluginState[]> {
    const installs = await prisma.pluginInstall.findMany({
      where: { siteId },
    });
    return installs.map((i) => ({
      slug: i.slug,
      version: i.version,
      isActive: i.isActive,
      settings: i.settings as Record<string, unknown>,
      activatedAt: i.activatedAt,
    }));
  },

  /** Reset (for testing) */
  reset(): void {
    for (const [slug] of loadedPlugins) {
      hooks.removeBySource(slug);
    }
    loadedPlugins.clear();
    discoveredPlugins = [];
  },
};

// ── Helpers ──

function resolvePluginsDir(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, "plugins"))) return join(cwd, "plugins");
  return join(cwd, "../../plugins");
}

/** Sort plugins by dependencies (Kahn's algorithm) */
function topologicalSort(
  slugs: string[],
  discovered: DiscoveredPlugin[],
): string[] {
  const manifestMap = new Map(discovered.map((d) => [d.slug, d.manifest]));
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();

  for (const slug of slugs) {
    inDegree.set(slug, 0);
    graph.set(slug, []);
  }

  for (const slug of slugs) {
    const manifest = manifestMap.get(slug);
    if (!manifest) continue;
    for (const dep of manifest.dependencies) {
      if (slugs.includes(dep)) {
        graph.get(dep)!.push(slug);
        inDegree.set(slug, (inDegree.get(slug) ?? 0) + 1);
      }
    }
  }

  const queue = slugs.filter((s) => (inDegree.get(s) ?? 0) === 0);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const next of graph.get(current) ?? []) {
      const newDegree = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDegree);
      if (newDegree === 0) queue.push(next);
    }
  }

  // Append any plugins with unresolvable deps at the end
  for (const slug of slugs) {
    if (!sorted.includes(slug)) sorted.push(slug);
  }

  return sorted;
}
