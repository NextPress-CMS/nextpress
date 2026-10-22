/**
 * OAuth step 1 — redirect an administrator to Instagram.
 *
 * SECURITY:
 *   - Requires an authenticated user with `instagram_manage_connection`.
 *     Connecting an account changes where a site's content comes from and
 *     stores a credential, so it is not an editor-level action.
 *   - The `state` value is HMAC-signed with the app secret and bound to this
 *     site, so a callback cannot be forged or replayed against another site.
 *   - The redirect URI comes from server configuration, never from the request.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import {
  buildAuthorizationUrl,
  createOAuthState,
  INSTAGRAM_PERMISSIONS,
} from "@nextpress/plugin-instagram-post";
import { getInstagramAppConfig } from "@/lib/instagram/adapters";

export async function GET(): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.manageConnection).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = getInstagramAppConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "Instagram is not configured. Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and INSTAGRAM_REDIRECT_URI.",
      },
      { status: 503 },
    );
  }

  const state = createOAuthState(auth.siteId, config.appSecret);
  const authorizationUrl = buildAuthorizationUrl(config, state);

  const response = NextResponse.redirect(authorizationUrl);

  // Second half of the CSRF defence: the callback must present BOTH a valid
  // signature and this cookie, so a signed state leaked from a log is not
  // enough on its own.
  response.cookies.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
