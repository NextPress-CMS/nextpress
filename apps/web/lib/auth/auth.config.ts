import type { NextAuthConfig } from "next-auth";
import { SESSION_CONFIG } from "@nextpress/core/auth/auth-config";
import type { SessionUser } from "@nextpress/core/auth/auth-types";

/**
 * Edge-safe half of the Auth.js config.
 *
 * Middleware runs on the Edge runtime, so it must not pull in Prisma, the
 * Prisma adapter or bcrypt. This file holds everything middleware needs
 * (session strategy, pages, the `authorized` gate and the token-to-session
 * mapping). `config.ts` spreads it and adds the Node-only pieces.
 */
export const authConfig = {
  // The docs, .env.example and CI use NEXTAUTH_SECRET; Auth.js v5 prefers
  // AUTH_SECRET. Accept either so a documented setup never runs secretless.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,

  // Auth.js v5 trusts the request host in production only when AUTH_URL or
  // AUTH_TRUST_HOST is set; the documented NEXTAUTH_URL does not count, so a
  // deploy that follows the docs rejects every session call (UntrustedHost).
  // An explicit URL pins the origin, which makes trusting the host safe. When
  // neither is set, leave it undefined so Auth.js keeps its own defaults
  // (Vercel, AUTH_TRUST_HOST, ...).
  ...((process.env.AUTH_URL || process.env.NEXTAUTH_URL) && { trustHost: true }),

  session: {
    strategy: SESSION_CONFIG.strategy,
    maxAge: SESSION_CONFIG.maxAge,
    updateAge: SESSION_CONFIG.updateAge,
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  // Providers need Node APIs (bcrypt, Prisma); they are added in config.ts.
  providers: [],

  callbacks: {
    /**
     * Session callback: shapes what `auth()` / `useSession()` returns.
     * Reads only the JWT, so it is safe on the edge.
     */
    async session({ session, token }) {
      if (token) {
        session.user = {
          id: token.id as string,
          email: token.email as string,
          name: token.name as string | null,
          displayName: (token.displayName as string | null) ?? null,
          image: token.picture as string | null,
        } satisfies SessionUser as unknown as typeof session.user;
      }
      return session;
    },

    /**
     * Authorized callback: runs in middleware to gate routes.
     * Route-level permission checks happen in server components, not here.
     */
    authorized({ auth: session, request: { nextUrl } }) {
      const isLoggedIn = !!session?.user;
      const isAdminRoute = nextUrl.pathname.startsWith("/admin");
      const isAuthRoute = nextUrl.pathname.startsWith("/login");

      if (isAdminRoute && !isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl.origin);
        loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
        return Response.redirect(loginUrl);
      }

      if (isAuthRoute && isLoggedIn) {
        return Response.redirect(new URL("/admin", nextUrl.origin));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
