/**
 * Scheduled Instagram synchronisation.
 *
 * Instagram offers NO webhook for "this account published new media" — the
 * available webhook fields cover comments, mentions, messages and story
 * insights only. Polling is therefore the correct design, not a shortcut.
 *
 * Schedule this every 15 minutes, mirroring `/api/cron/publish`:
 *   Vercel Cron   → vercel.json crons entry
 *   Other hosts   → any scheduler issuing an authenticated POST
 *
 * Each site's configured interval is honoured INSIDE the sync service, so a
 * frequent cron tick is cheap: sites that are not due are skipped without an
 * API call.
 *
 * SECURITY: POST only (synchronisation writes content), always gated on
 * CRON_SECRET, matching the existing publish cron.
 */

import { NextResponse } from "next/server";
import { prisma } from "@nextpress/db";
import { ROLE_MAP } from "@nextpress/core/auth/roles";
import type { AuthContext } from "@nextpress/core/auth/auth-types";
import { createSyncService } from "@/lib/instagram/adapters";

export async function POST(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 403 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sites = await prisma.site.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const syncService = createSyncService();
  const results: Array<{ siteId: string; ran: boolean; imported: number; reason?: string }> = [];

  // Sequential across sites: parallel runs would multiply concurrent Instagram
  // requests and media downloads with no benefit inside a cron window.
  for (const site of sites) {
    try {
      const result = await syncService.syncSite(systemAuth(site.id), false);
      results.push({
        siteId: site.id,
        ran: result.ran,
        imported: result.imported,
        reason: result.reason,
      });
    } catch {
      // One broken tenant must never abort the run for every other site.
      results.push({ siteId: site.id, ran: false, imported: 0, reason: "Synchronisation failed." });
    }
  }

  return NextResponse.json(
    {
      sites: results.length,
      synced: results.filter((r) => r.ran).length,
      imported: results.reduce((sum, r) => sum + r.imported, 0),
      results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Health check only — never performs a sync. */
export async function GET(): Promise<Response> {
  return NextResponse.json({ status: "ok", method: "Use POST to trigger synchronisation" });
}

/**
 * System auth context for cron.
 *
 * Scoped to ONE site per call, so the site isolation that protects
 * request-time code protects the scheduled path identically.
 */
function systemAuth(siteId: string): AuthContext {
  // Permissions come from the real role definition rather than a hand-written
  // list, so the cron context can never drift into holding more authority
  // than an administrator actually has.
  const admin = ROLE_MAP.get("admin");

  return {
    user: {
      id: "system:instagram-cron",
      email: "system@localhost",
      name: "Instagram Sync",
      displayName: null,
      image: null,
    },
    siteId,
    role: "admin",
    permissions: new Set(admin?.permissions ?? []),
  };
}
