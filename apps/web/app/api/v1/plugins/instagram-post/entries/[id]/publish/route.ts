/**
 * Publish a single entry to Instagram.
 *
 * Requires `instagram_publish`. The publish service refuses anything that is
 * not PUBLISHED in NextPress, so a draft can never reach a live audience, and
 * it refuses an entry already published or mid-flight — which is what stops
 * two administrators clicking "Publish" from producing two Instagram posts.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import { INSTAGRAM_PERMISSIONS } from "@nextpress/plugin-instagram-post";
import { connectionService, createPublishService } from "@/lib/instagram/adapters";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.publish).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  const token = await connectionService.getUsableToken(auth);
  if (!token) {
    return NextResponse.json(
      { error: "The Instagram connection requires attention. Reconnect the account." },
      { status: 409 },
    );
  }

  const outcome = await createPublishService(token).publish(auth, id);

  // Status codes carry the outcome so the UI can react without string matching.
  const status =
    outcome.status === "published"
      ? 200
      : outcome.status === "invalid"
        ? 422
        : outcome.status === "skipped"
          ? 409
          : outcome.status === "ambiguous"
            ? 202
            : 502;

  return NextResponse.json(outcome, { status, headers: { "Cache-Control": "no-store" } });
}
