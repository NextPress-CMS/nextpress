import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@nextpress/db";
import { SESSION_CONFIG } from "@nextpress/core/auth/auth-config";
import type { SessionUser } from "@nextpress/core/auth/auth-types";

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Strategy: JWT (stateless). The JWT contains only the SessionUser fields.
 * Site-scoped role/permissions are resolved per-request, NOT stored in JWT,
 * because a user can have different roles on different sites.
 *
 * Providers:
 *   - Credentials: email + password (bcrypt-verified)
 *   - Google OAuth (if env vars set)
 *   - GitHub OAuth (if env vars set)
 */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: SESSION_CONFIG.strategy,
    maxAge: SESSION_CONFIG.maxAge,
    updateAge: SESSION_CONFIG.updateAge,
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          select: {
            id: true,
            email: true,
            name: true,
            displayName: true,
            image: true,
            passwordHash: true,
          },
        });

        // SECURITY: Always run bcrypt compare to prevent timing-based
        // email enumeration. If user doesn't exist, compare against a
        // dummy hash so the response time is consistent.
        const hashToCompare =
          user?.passwordHash ??
          "$2b$12$0000000000000000000000000000000000000000000000000000";
        const isValid = await compare(password, hashToCompare);
        if (!user || !isValid) return null;

        // Return the slim user object (becomes the JWT payload)
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),

    // OAuth providers — only enabled if env vars are set
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),

    ...(process.env.GITHUB_CLIENT_ID
      ? [
          GitHub({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],

  callbacks: {
    /**
     * JWT callback: invoked on sign-in and on every request.
     * On sign-in (user is defined), embed our SessionUser fields.
     * On subsequent requests, the token already has them.
     */
    async jwt({ token, user }) {
      if (user) {
        // Sign-in: populate token with user data
        token.id = user.id;
        token.email = user.email;

        // Fetch displayName (not available from the authorize return)
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { displayName: true },
        });
        token.displayName = dbUser?.displayName ?? null;
      }
      return token;
    },

    /**
     * Session callback: shapes what `auth()` / `useSession()` returns.
     * We attach our typed SessionUser to the session.
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
     * Returns true/false. Route-level permission checks happen
     * in the page/layout server components, not here.
     */
    authorized({ auth: session, request: { nextUrl } }) {
      const isLoggedIn = !!session?.user;
      const isAdminRoute = nextUrl.pathname.startsWith("/admin");
      const isAuthRoute =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register");

      // Admin routes require authentication
      if (isAdminRoute && !isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl.origin);
        loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
        return Response.redirect(loginUrl);
      }

      // Auth routes redirect to admin if already logged in
      if (isAuthRoute && isLoggedIn) {
        return Response.redirect(new URL("/admin", nextUrl.origin));
      }

      return true;
    },
  },
});

