/**
 * Instagram OAuth — Business Login for Instagram
 *
 * Flow (docs: /docs/instagram-platform/instagram-api-with-instagram-login/business-login):
 *
 *   1. buildAuthorizationUrl()  → redirect the admin to instagram.com
 *   2. exchangeCodeForToken()   → server-side code exchange, 1-hour token
 *   3. exchangeForLongLived()   → 60-day token
 *   4. refreshLongLivedToken()  → another 60 days (token must be >24h old)
 *
 * SECURITY:
 *   - The client secret is used ONLY here, only server-side. It is never sent
 *     to the browser and never appears in a redirect.
 *   - `state` is a signed, expiring value bound to the site. The callback
 *     recomputes the signature, so a forged callback cannot connect an account.
 *   - The redirect URI is validated against configuration; arbitrary callback
 *     parameters are never trusted as a redirect target.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  InstagramAuthError,
  InstagramNetworkError,
  InstagramValidationError,
  classifyGraphError,
} from "./instagram-errors";
import { graphErrorSchema, longLivedTokenSchema, shortLivedTokenSchema } from "./instagram-types";

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_HOST = "https://graph.instagram.com";

/**
 * Scopes required by this plugin.
 * The legacy `business_*` names were removed by Meta on 27 Jan 2025.
 */
export const REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

/** OAuth state is single-use and short-lived; 10 minutes is ample for a login. */
const STATE_TTL_MS = 10 * 60 * 1000;

export interface InstagramAppConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface OAuthState {
  siteId: string;
  nonce: string;
  issuedAt: number;
}

// ── State: CSRF protection ──

/**
 * Build a tamper-evident state value: `base64url(payload).hmac`.
 *
 * Signing (rather than storing a nonce in a session table) keeps the callback
 * stateless while still making forgery infeasible without the app secret.
 */
export function createOAuthState(siteId: string, appSecret: string): string {
  const payload: OAuthState = {
    siteId,
    nonce: randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, appSecret)}`;
}

/**
 * Verify a state value returned by Instagram.
 *
 * Returns null on ANY problem — bad shape, bad signature, expired, wrong site.
 * Callers must treat null as "abort the connection", never as "continue".
 */
export function verifyOAuthState(
  state: string,
  appSecret: string,
  expectedSiteId: string,
): OAuthState | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts as [string, string];
  if (!constantTimeEquals(signature, sign(encoded, appSecret))) return null;

  let payload: OAuthState;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null) return null;
    payload = decoded as OAuthState;
  } catch {
    return null;
  }

  if (typeof payload.siteId !== "string" || typeof payload.issuedAt !== "number") return null;
  if (payload.siteId !== expectedSiteId) return null;
  if (Date.now() - payload.issuedAt > STATE_TTL_MS) return null;

  return payload;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Timing-safe compare that tolerates unequal lengths without leaking them. */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ── Step 1: authorization URL ──

export function buildAuthorizationUrl(config: InstagramAppConfig, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", REQUIRED_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

// ── Step 2: code → short-lived token ──

export interface ShortLivedTokenResult {
  accessToken: string;
  userId: string;
  grantedScopes: string[];
}

export async function exchangeCodeForToken(
  config: InstagramAppConfig,
  code: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ShortLivedTokenResult> {
  const body = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });

  const json = await postForm(TOKEN_URL, body, fetchImpl, "authorization code exchange");
  const parsed = shortLivedTokenSchema.safeParse(json);
  if (!parsed.success) {
    throw InstagramValidationError({
      message: "Instagram returned an unexpected token response",
      cause: parsed.error,
    });
  }

  const permissions = parsed.data.permissions;
  const grantedScopes = Array.isArray(permissions)
    ? permissions
    : typeof permissions === "string"
      ? permissions.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  return {
    accessToken: parsed.data.access_token,
    userId: parsed.data.user_id,
    grantedScopes,
  };
}

/**
 * Confirm the user actually granted what the plugin needs.
 *
 * Meta lets a user deselect individual permissions on the consent screen, so a
 * successful exchange does NOT imply publishing rights. Catching it here yields
 * a clear message at connect time instead of a mystery failure weeks later.
 *
 * An empty list means Meta did not report scopes; that is not evidence of
 * refusal, so it is accepted rather than blocking a valid connection.
 */
export function validateGrantedScopes(grantedScopes: string[]): {
  valid: boolean;
  missing: string[];
} {
  if (grantedScopes.length === 0) return { valid: true, missing: [] };
  const missing = REQUIRED_SCOPES.filter((scope) => !grantedScopes.includes(scope));
  return { valid: missing.length === 0, missing };
}

// ── Step 3: short-lived → long-lived (60 days) ──

export interface LongLivedTokenResult {
  accessToken: string;
  expiresAt: Date;
}

export async function exchangeForLongLived(
  config: InstagramAppConfig,
  shortLivedToken: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<LongLivedTokenResult> {
  const url = new URL(`${GRAPH_HOST}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("access_token", shortLivedToken);

  return toTokenResult(await getJson(url.toString(), fetchImpl, "long-lived token exchange"));
}

// ── Step 4: refresh (another 60 days) ──

/**
 * Refresh a long-lived token.
 *
 * Preconditions from Meta: the token must be at least 24 hours old, still
 * valid, and hold instagram_business_basic. A token left unrefreshed for 60
 * days dies permanently and requires a full re-authorisation.
 */
export async function refreshLongLivedToken(
  accessToken: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<LongLivedTokenResult> {
  const url = new URL(`${GRAPH_HOST}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);

  return toTokenResult(await getJson(url.toString(), fetchImpl, "token refresh"));
}

function toTokenResult(json: unknown): LongLivedTokenResult {
  const parsed = longLivedTokenSchema.safeParse(json);
  if (!parsed.success) {
    throw InstagramValidationError({
      message: "Instagram returned an unexpected long-lived token response",
      cause: parsed.error,
    });
  }
  return {
    accessToken: parsed.data.access_token,
    expiresAt: new Date(Date.now() + parsed.data.expires_in * 1000),
  };
}

// ── Transport helpers ──
//
// Deliberately separate from InstagramApiClient: the auth endpoints live on
// different hosts and are called before a client can even be constructed.

async function postForm(
  url: string,
  body: URLSearchParams,
  fetchImpl: typeof fetch,
  context: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    throw InstagramNetworkError({ message: `${context} failed: could not reach Instagram`, cause });
  }
  return readJson(response, context);
}

async function getJson(url: string, fetchImpl: typeof fetch, context: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(15_000) });
  } catch (cause) {
    throw InstagramNetworkError({ message: `${context} failed: could not reach Instagram`, cause });
  }
  return readJson(response, context);
}

async function readJson(response: Response, context: string): Promise<unknown> {
  const text = await response.text();

  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw InstagramAuthError({
      message: `${context} failed: Instagram returned a non-JSON response (HTTP ${response.status})`,
    });
  }

  if (response.ok) return json;

  const parsedError = graphErrorSchema.safeParse(json);
  if (parsedError.success) throw classifyGraphError(parsedError.data.error, context);

  throw InstagramAuthError({ message: `${context} failed with HTTP ${response.status}` });
}
