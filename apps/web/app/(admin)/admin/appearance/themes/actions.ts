"use server";

import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join, dirname, normalize, sep } from "path";
import AdmZip from "adm-zip";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { prisma } from "@nextpress/db";

const SKINS_DIR = join(process.cwd(), "public", "skins");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ENTRIES = 500;
const ALLOWED_EXT = new Set([
  ".css", ".json", ".md", ".txt",
  ".png", ".jpg", ".jpeg", ".webp", ".svg", ".avif", ".gif", ".ico",
  ".woff", ".woff2", ".ttf", ".otf",
]);

function sanitizeEntryPath(entryName: string): string | null {
  // Block absolute paths, .., drive letters, backslashes
  if (entryName.includes("..")) return null;
  if (entryName.startsWith("/") || entryName.startsWith("\\")) return null;
  if (/^[a-zA-Z]:/.test(entryName)) return null;
  const normalized = normalize(entryName).replace(/\\/g, "/");
  if (normalized.startsWith("..")) return null;
  return normalized;
}

function extFromName(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

interface ActionResult {
  error?: string;
  success?: { slug: string; name: string };
}

export async function uploadSkin(formData: FormData): Promise<ActionResult> {
  const auth = await requirePermission("switch_themes");

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided" };
  if (file.size === 0) return { error: "File is empty" };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` };
  }
  if (!/\.zip$/i.test(file.name)) return { error: "Must be a .zip file" };

  let zip: AdmZip;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    zip = new AdmZip(buffer);
  } catch {
    return { error: "Invalid or corrupt zip archive" };
  }

  const entries = zip.getEntries();
  if (entries.length === 0) return { error: "Zip is empty" };
  if (entries.length > MAX_ENTRIES) return { error: `Too many files (max ${MAX_ENTRIES})` };

  // Detect a single top-level directory — if present, strip it so the theme.json
  // inside lands at the root of public/skins/<slug>/
  let prefix = "";
  const topLevels = new Set<string>();
  for (const e of entries) {
    const first = e.entryName.split("/")[0];
    if (first) topLevels.add(first);
  }
  if (topLevels.size === 1) {
    const only = [...topLevels][0];
    const hasRootFiles = entries.some(
      (e) => !e.isDirectory && !e.entryName.startsWith(`${only}/`),
    );
    if (!hasRootFiles) prefix = `${only}/`;
  }

  // Find and parse theme.json
  const manifestEntry = entries.find(
    (e) => !e.isDirectory && e.entryName === `${prefix}theme.json`,
  );
  if (!manifestEntry) return { error: "theme.json not found at the zip root" };

  let manifest: { slug?: unknown; name?: unknown; version?: unknown; description?: unknown; author?: unknown };
  try {
    manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
  } catch {
    return { error: "theme.json is not valid JSON" };
  }

  if (typeof manifest.slug !== "string" || !/^[a-z0-9-]+$/.test(manifest.slug)) {
    return { error: "theme.json slug must be lowercase letters, digits, and dashes" };
  }
  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    return { error: "theme.json name is required" };
  }
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    return { error: "theme.json version is required" };
  }
  if (manifest.slug.length < 2 || manifest.slug.length > 50) {
    return { error: "Slug must be 2–50 characters" };
  }

  const cssEntry = entries.find(
    (e) => !e.isDirectory && e.entryName === `${prefix}styles/theme.css`,
  );
  if (!cssEntry) return { error: "styles/theme.css is required in the zip" };

  const slug = manifest.slug;
  const targetDir = join(SKINS_DIR, slug);

  // Prevent collision with a statically registered theme
  if (["blockchainist", "default", "twentytwentysix"].includes(slug)) {
    return { error: `'${slug}' is a built-in theme name, pick a different slug` };
  }

  // Wipe any existing skin at this slug (in-place re-install)
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }
  mkdirSync(targetDir, { recursive: true });

  // Write a clean normalized manifest so listSkins() can trust it
  const cleanManifest = {
    slug,
    name: String(manifest.name).trim(),
    version: String(manifest.version).trim(),
    description: typeof manifest.description === "string" ? manifest.description : undefined,
    author: typeof manifest.author === "string" ? manifest.author : undefined,
  };

  // Extract whitelisted files
  let wrote = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const relativeName = entry.entryName.slice(prefix.length);
    if (!relativeName) continue;

    const safeRel = sanitizeEntryPath(relativeName);
    if (!safeRel) {
      rmSync(targetDir, { recursive: true, force: true });
      return { error: `Unsafe path in zip: ${entry.entryName}` };
    }

    // Skip the original manifest — we write the clean version ourselves
    if (safeRel === "theme.json") continue;

    const ext = extFromName(safeRel);
    if (!ALLOWED_EXT.has(ext)) continue;

    const destPath = join(targetDir, safeRel);
    const normalizedDest = normalize(destPath);
    if (!normalizedDest.startsWith(normalize(targetDir) + sep)) {
      rmSync(targetDir, { recursive: true, force: true });
      return { error: `Unsafe resolved path: ${entry.entryName}` };
    }

    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, entry.getData());
    wrote++;
  }

  if (wrote === 0) {
    rmSync(targetDir, { recursive: true, force: true });
    return { error: "Zip had no usable files after filtering" };
  }

  writeFileSync(join(targetDir, "theme.json"), JSON.stringify(cleanManifest, null, 2));

  // Upsert an inactive ThemeInstall row so the skin appears in the theme list
  await prisma.themeInstall.upsert({
    where: { siteId_slug: { siteId: auth.siteId, slug } },
    update: { version: cleanManifest.version },
    create: {
      siteId: auth.siteId,
      slug,
      version: cleanManifest.version,
      isActive: false,
    },
  });

  revalidatePath("/admin/appearance/themes");
  revalidatePath("/");

  return { success: { slug, name: cleanManifest.name } };
}

export async function deleteSkin(slug: string): Promise<ActionResult> {
  const auth = await requirePermission("switch_themes");
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: "Invalid slug" };

  const install = await prisma.themeInstall.findUnique({
    where: { siteId_slug: { siteId: auth.siteId, slug } },
  });
  if (install?.isActive) {
    return { error: "Cannot delete the active theme — activate another one first" };
  }

  const targetDir = join(SKINS_DIR, slug);
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  await prisma.themeInstall.deleteMany({
    where: { siteId: auth.siteId, slug },
  });

  revalidatePath("/admin/appearance/themes");
  return { success: { slug, name: slug } };
}
