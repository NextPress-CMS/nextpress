// ============================================================================
// Next.js Middleware
// ============================================================================
// Runs on the Edge Runtime for every matched request.
//
// Responsibilities:
//   1. Auth gate: redirect unauthenticated users away from /admin/*
//   2. Site resolution: set x-site-id header for downstream code
//   3. Auth route redirect: send logged-in users away from /login
//
// What this does NOT do:
//   - Permission checks (too expensive for edge — done in server components)
//   - Database queries (edge runtime can't use Prisma with full PG driver)
//     Site resolution here uses a lightweight check; full resolution is in
//     lib/site/resolve.ts which runs in Node.js server components.
//
// The `authorized` callback in auth config handles the auth gate.
// This middleware handles headers and additional routing logic.
// ============================================================================

import NextAuth from "next-auth";
import { authConfig } from "./lib/auth/auth.config";

// Built from the edge-safe config only: importing ./lib/auth/config here would
// pull Prisma and bcrypt into the Edge bundle.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets (images, etc.)
     * - API routes that handle their own auth (webhooks, upload)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
