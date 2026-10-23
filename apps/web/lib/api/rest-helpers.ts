/**
 * REST API helpers — shared utilities for /api/v1/* routes.
 *
 * Handles:
 *   - Auth (Bearer token or session cookie)
 *   - Standard JSON response format
 *   - Pagination query params
 *   - Error formatting
 *   - CORS headers
 */

import { NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { getAuthContext } from "../auth/session";
import type { AuthContext } from "@nextpress/core/auth/auth-types";
import type { CmsError } from "@nextpress/core/errors/cms-error";

// ── Standard response envelope ──

export interface ApiResponse<T = unknown> {
  data: T;
  meta?: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ── Response helpers ──

export function jsonResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data } satisfies ApiResponse<T>, {
    status,
    headers: corsHeaders(),
  });
}

export function paginatedResponse<T>(
  data: T[],
  meta: { page: number; perPage: number; total: number; totalPages: number },
  status = 200,
): NextResponse {
  return NextResponse.json({ data, meta } satisfies ApiResponse<T[]>, {
    status,
    headers: corsHeaders(),
  });
}

export function errorResponse(
  code: string,
  message: string,
  status = 500,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, details } } satisfies ApiError,
    { status, headers: corsHeaders() },
  );
}

export function handleCmsError(e: unknown): NextResponse {
  if (e && typeof e === "object" && "statusCode" in e) {
    const err = e as CmsError;
    return errorResponse(err.code, err.message, err.statusCode, err.details);
  }
  // REST routes that delegate to tRPC procedures surface TRPCErrors; map them
  // to their HTTP status instead of a blanket 500.
  if (e instanceof TRPCError) {
    // Unwrap CmsErrors thrown by services inside a procedure.
    if (e.cause && typeof e.cause === "object" && "statusCode" in e.cause) {
      return handleCmsError(e.cause);
    }
    // Zod input failures arrive as BAD_REQUEST with the ZodError as cause.
    const details = e.cause && "issues" in e.cause ? { issues: (e.cause as { issues: unknown }).issues } : undefined;
    return errorResponse(e.code, e.message, getHTTPStatusCodeFromError(e), details);
  }
  const message = e instanceof Error ? e.message : "Internal server error";
  return errorResponse("INTERNAL_ERROR", message, 500);
}

// ── Auth ──

export async function requireRestAuth(): Promise<AuthContext> {
  const auth = await getAuthContext();
  if (!auth) {
    throw Object.assign(new Error("Not authenticated"), {
      code: "UNAUTHENTICATED",
      statusCode: 401,
    });
  }
  return auth;
}

export async function optionalRestAuth(): Promise<AuthContext | null> {
  return getAuthContext();
}

// ── Query param parsing ──

export function parsePagination(url: URL) {
  return {
    page: Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10)),
    perPage: Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") ?? "20", 10))),
  };
}

export function parseSort(url: URL, allowed: string[], defaultSort = "createdAt") {
  const sortBy = url.searchParams.get("sort") ?? defaultSort;
  const sortOrder = (url.searchParams.get("order") ?? "desc") as "asc" | "desc";
  return {
    sortBy: allowed.includes(sortBy) ? sortBy : defaultSort,
    sortOrder: sortOrder === "asc" ? "asc" as const : "desc" as const,
  };
}

// ── CORS ──

/**
 * SECURITY: CORS is restricted to configured origins only.
 * Set ALLOWED_ORIGINS env var as comma-separated list:
 *   ALLOWED_ORIGINS=https://example.com,https://admin.example.com
 * If unset, only same-origin requests are allowed (no CORS headers).
 */
function corsHeaders(requestOrigin?: string | null): Record<string, string> {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? [];
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Site-ID";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

/** OPTIONS handler for CORS preflight */
export function handleOptions(req?: Request) {
  const origin = req?.headers.get("origin") ?? null;
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
