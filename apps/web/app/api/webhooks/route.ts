/**
 * Incoming webhook receiver.
 *
 * Verifies HMAC signatures and dispatches to registered handlers.
 * Used for: payment callbacks, external service notifications, etc.
 *
 * External services POST to /api/webhooks with:
 *   - X-Webhook-Source header identifying the source (a-z, 0-9, _)
 *   - X-Webhook-Signature header: "sha256=<hex HMAC of the raw body>"
 *   - JSON body with event data
 *
 * Each source needs WEBHOOK_SECRET_<SOURCE> in the environment.
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

// The source picks which env var is read, so restrict it to a safe shape.
const SOURCE_PATTERN = /^[a-z0-9_]{1,40}$/;

function unauthorized() {
  // One generic response for every failure, so callers cannot probe which
  // sources are configured.
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const source = (req.headers.get("x-webhook-source") ?? "").toLowerCase();
  const signature = req.headers.get("x-webhook-signature");
  if (!SOURCE_PATTERN.test(source)) return unauthorized();

  // SECURITY: a configured secret is always required for the source.
  const secret = process.env[`WEBHOOK_SECRET_${source.toUpperCase()}`];
  if (!secret) return unauthorized();

  if (!signature || !signature.startsWith("sha256=")) return unauthorized();

  const body = await req.text();

  // SECURITY: constant-time comparison to prevent timing attacks.
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return unauthorized();

  // Log metadata only: payloads can contain personal or payment data.
  console.log(`[Webhook] Verified from ${source} (${body.length} bytes)`);

  return NextResponse.json({ received: true }, { status: 200 });
}
