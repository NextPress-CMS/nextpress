import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Shared CRON_SECRET gate for /api/cron/*.
 *
 * Vercel Cron calls the path with GET and `Authorization: Bearer $CRON_SECRET`;
 * other schedulers usually POST. Both methods run the job, but only with the
 * secret, so an unauthenticated GET can never trigger work.
 *
 * Returns null when authorized, or the response to send back.
 */
export function checkCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 403 });
  }
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  // Length check first: timingSafeEqual throws on unequal lengths.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
