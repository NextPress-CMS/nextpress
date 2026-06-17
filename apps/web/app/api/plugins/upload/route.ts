/**
 * Plugin upload endpoint.
 *
 * Accepts a ZIP file containing a plugin. Validates the archive contains
 * a valid plugin.json manifest, extracts to the plugins/ directory,
 * and returns the plugin metadata.
 *
 * WordPress-style: upload a .zip → plugin is installed and available to activate.
 */

import { NextResponse } from "next/server";
import { requireAuthContext } from "@/lib/auth/session";
import { assertCan } from "@nextpress/core/auth/permissions";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

// Plugins live at the monorepo root
const PLUGINS_DIR = path.resolve(process.cwd(), "../../plugins");

const MAX_PLUGIN_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: Request) {
  try {
    const auth = await requireAuthContext();
    assertCan(auth, "manage_plugins");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".zip")) {
      return NextResponse.json({ error: "Only .zip files are accepted" }, { status: 400 });
    }

    if (file.size > MAX_PLUGIN_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum ${MAX_PLUGIN_SIZE / 1024 / 1024}MB` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse the zip
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      return NextResponse.json({ error: "Invalid ZIP file" }, { status: 400 });
    }

    const entries = zip.getEntries();

    // Find plugin.json — could be at root or inside a single top-level directory
    let manifestEntry = entries.find((e) => e.entryName === "plugin.json");
    let stripPrefix = "";

    if (!manifestEntry) {
      // Check if plugin.json is inside a single top-level folder
      const topDirs = new Set(
        entries
          .map((e) => e.entryName.split("/")[0])
          .filter(Boolean),
      );

      if (topDirs.size === 1) {
        const dir = [...topDirs][0]!;
        manifestEntry = entries.find(
          (e) => e.entryName === `${dir}/plugin.json`,
        );
        if (manifestEntry) stripPrefix = `${dir}/`;
      }
    }

    if (!manifestEntry) {
      return NextResponse.json(
        { error: "Invalid plugin: missing plugin.json manifest" },
        { status: 400 },
      );
    }

    // Parse and validate manifest
    let manifest: any;
    try {
      manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
    } catch {
      return NextResponse.json(
        { error: "Invalid plugin.json: not valid JSON" },
        { status: 400 },
      );
    }

    if (!manifest.slug || !manifest.name) {
      return NextResponse.json(
        { error: "Invalid plugin.json: missing required fields (slug, name)" },
        { status: 400 },
      );
    }

    if (!/^[a-z0-9-]+$/.test(manifest.slug)) {
      return NextResponse.json(
        { error: "Invalid plugin slug: only lowercase letters, numbers, and hyphens allowed" },
        { status: 400 },
      );
    }

    // Check if plugin already exists
    const targetDir = path.join(PLUGINS_DIR, manifest.slug);
    if (existsSync(targetDir)) {
      // Remove existing to allow updates/reinstalls
      await fs.rm(targetDir, { recursive: true, force: true });
    }

    // Extract files to plugins/<slug>/
    await fs.mkdir(targetDir, { recursive: true });

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      let relativePath = entry.entryName;
      if (stripPrefix && relativePath.startsWith(stripPrefix)) {
        relativePath = relativePath.slice(stripPrefix.length);
      }
      if (!relativePath) continue;

      const fullPath = path.join(targetDir, relativePath);
      const dir = path.dirname(fullPath);

      // Security: ensure path doesn't escape target directory
      if (!fullPath.startsWith(targetDir)) continue;

      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, entry.getData());
    }

    return NextResponse.json(
      {
        slug: manifest.slug,
        name: manifest.name,
        version: manifest.version ?? "1.0.0",
        description: manifest.description ?? "",
        author: manifest.author ?? "",
        message: `Plugin "${manifest.name}" installed successfully`,
      },
      { status: 201 },
    );
  } catch (e: any) {
    const status = e.statusCode ?? 500;
    return NextResponse.json(
      { error: e.message ?? "Plugin upload failed" },
      { status },
    );
  }
}
