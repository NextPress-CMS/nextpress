/**
 * OAuth step 2 — handle Instagram's redirect back.
 *
 * SECURITY — this endpoint is reachable by anyone, so nothing in the query
 * string is trusted:
 *   - `state` must carry a valid HMAC AND match the cookie set at step 1.
 *   - The authorization code is exchanged SERVER-SIDE; the app secret never
 *     touches the browser, and the code is never logged.
 *   - Granted scopes are verified, so a partial consent fails loudly at
 *     connect time rather than silently at first publish.
 *   - The account is confirmed to be a professional account before saving.
 *   - Redirects go to a fixed internal admin path, never to a URL supplied in
 *     the callback.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@nextpress/core/auth/permissions";
import {
  INSTAGRAM_PERMISSIONS,
  InstagramApiClient,
  exchangeCodeForToken,
  exchangeForLongLived,
  isInstagramError,
  validateGrantedScopes,
  verifyOAuthState,
} from "@nextpress/plugin-instagram-post";
import { connectionService, getInstagramAppConfig } from "@/lib/instagram/adapters";

const ADMIN_PATH = "/admin/plugins/instagram-post";

/** Always land on the plugin dashboard; the message is a fixed enum, not free text. */
function redirectWith(request: Request, status: string): Response {
  const url = new URL(ADMIN_PATH, new URL(request.url).origin);
  url.searchParams.set("instagram", status);
  const response = NextResponse.redirect(url);
  response.cookies.delete("ig_oauth_state");
  return response;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth, INSTAGRAM_PERMISSIONS.manageConnection).granted) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);

  // The user pressed Cancel on Instagram's consent screen. Not an error.
  if (url.searchParams.get("error")) return redirectWith(request, "cancelled");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectWith(request, "invalid_response");

  const config = getInstagramAppConfig();
  if (!config) return redirectWith(request, "not_configured");

  // ── CSRF: signature AND cookie must both check out ──
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("ig_oauth_state="))
    ?.slice("ig_oauth_state=".length);

  if (!cookieState || cookieState !== state) return redirectWith(request, "invalid_state");
  if (!verifyOAuthState(state, config.appSecret, auth.siteId)) {
    return redirectWith(request, "invalid_state");
  }

  try {
    const shortLived = await exchangeCodeForToken(config, code);

    const scopeCheck = validateGrantedScopes(shortLived.grantedScopes);
    if (!scopeCheck.valid) return redirectWith(request, "missing_permissions");

    const longLived = await exchangeForLongLived(config, shortLived.accessToken);

    // Confirm the account is usable BEFORE persisting anything. A personal
    // account cannot be read or published to, and discovering that at connect
    // time is far kinder than a stream of failed syncs later.
    const client = new InstagramApiClient({
      accessToken: longLived.accessToken,
      accountId: shortLived.userId,
    });
    const account = await client.getAccount();

    await connectionService.saveConnection(auth, {
      accountId: account.id,
      username: account.username,
      accountType: account.account_type,
      accessToken: longLived.accessToken,
      tokenExpiresAt: longLived.expiresAt,
    });

    return redirectWith(request, "connected");
  } catch (error) {
    // The message is deliberately not echoed back: it can contain Graph detail.
    return redirectWith(
      request,
      isInstagramError(error) && error.category === "permission"
        ? "missing_permissions"
        : "connection_failed",
    );
  }
}
