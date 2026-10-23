import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@nextpress/db";
import { authConfig } from "./auth.config";

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
  // Edge-safe settings (secret, session, pages, session/authorized callbacks)
  // are shared with middleware; see auth.config.ts.
  ...authConfig,
  adapter: PrismaAdapter(prisma),

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

    // OAuth providers: enabled only when BOTH id and secret are set, so a
    // half-configured provider is skipped instead of failing at sign-in.
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHub({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
  ],

  callbacks: {
    ...authConfig.callbacks,
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

  },
});

