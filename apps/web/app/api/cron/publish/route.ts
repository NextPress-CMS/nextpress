/**
 * Cron endpoint for scheduled publishing.
 *
 * Call this every minute via:
 *   - Vercel Cron: vercel.json → { "crons": [{ "path": "/api/cron/publish", "schedule": "* * * * *" }] }
 *   - Railway/Render: external cron service hitting this URL
 *   - System crontab: curl https://your-site.com/api/cron/publish
 *
 * Protected by CRON_SECRET — the request must include an Authorization
 * header matching the CRON_SECRET env var. Vercel sets this automatically.
 */

import { NextResponse } from "next/server";
import { scheduler } from "@nextpress/core/scheduling/scheduler";
import { checkCronAuth } from "@/lib/cron";

/**
 * SECURITY: always requires CRON_SECRET (constant-time compare). GET is
 * accepted because Vercel Cron issues GET requests; without the secret
 * neither method publishes anything.
 */
async function run(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;

  const result = await scheduler.publishScheduledEntries();
  return NextResponse.json(result, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = run;
export const POST = run;
