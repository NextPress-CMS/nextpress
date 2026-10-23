import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { prisma } from "@nextpress/db";
import {
  router,
  authedProcedure,
  permissionProcedure,
} from "../trpc";

/**
 * User router — demonstrates the permission middleware pattern.
 *
 * Each procedure uses the appropriate permission level:
 *   - me:     any authenticated user (own profile)
 *   - list:   requires "list_users"
 *   - create: requires "create_users"
 *   - delete: requires "delete_users"
 */
export const userRouter = router({
  /** Get current user's own profile */
  me: authedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.auth.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        image: true,
        bio: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return { ...user, role: ctx.auth.role };
  }),

  /** List users on the current site */
  list: permissionProcedure("list_users")
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, perPage, search } = input;
      const skip = (page - 1) * perPage;

      const where = {
        sites: {
          some: { siteId: ctx.auth.siteId },
        },
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" as const } },
                { name: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            name: true,
            displayName: true,
            image: true,
            createdAt: true,
            sites: {
              where: { siteId: ctx.auth.siteId },
              select: {
                role: { select: { slug: true, name: true } },
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      return {
        users: users.map((u) => ({
          ...u,
          role: u.sites[0]?.role ?? null,
          sites: undefined,
        })),
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
      };
    }),

  /** Roles a user can be assigned (for role pickers) */
  roles: permissionProcedure("list_users").query(async () => {
    return prisma.role.findMany({
      orderBy: { name: "asc" },
      select: { slug: true, name: true, description: true },
    });
  }),

  /** Get one user on the current site */
  getById: permissionProcedure("list_users")
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const membership = await prisma.userSite.findUnique({
        where: { userId_siteId: { userId: input.id, siteId: ctx.auth.siteId } },
        select: {
          joinedAt: true,
          role: { select: { slug: true, name: true } },
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              displayName: true,
              image: true,
              bio: true,
              createdAt: true,
              _count: { select: { contentEntries: true } },
            },
          },
        },
      });
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      const { _count, ...user } = membership.user;
      return {
        ...user,
        entryCount: _count.contentEntries,
        role: membership.role,
        joinedAt: membership.joinedAt,
      };
    }),

  /** Update a user's profile and, with promote_users, their role */
  update: permissionProcedure("edit_users")
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().min(1).max(200).optional(),
        displayName: z.string().max(200).nullable().optional(),
        bio: z.string().max(5000).nullable().optional(),
        roleSlug: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await prisma.userSite.findUnique({
        where: { userId_siteId: { userId: input.id, siteId: ctx.auth.siteId } },
        select: { role: { select: { slug: true } } },
      });
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const isAdmin = ctx.auth.role === "super_admin" || ctx.auth.role === "admin";
      // Non-admins may not touch admin accounts at all.
      if (!isAdmin && ["admin", "super_admin"].includes(membership.role.slug)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can edit admin users" });
      }

      let roleId: string | undefined;
      if (input.roleSlug && input.roleSlug !== membership.role.slug) {
        if (!ctx.auth.permissions.has("promote_users")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You cannot change user roles" });
        }
        if (input.id === ctx.auth.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role" });
        }
        if (input.roleSlug === "super_admin" && ctx.auth.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only super admins can grant super admin" });
        }
        if (input.roleSlug === "admin" && !isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can grant admin" });
        }
        const role = await prisma.role.findUnique({ where: { slug: input.roleSlug } });
        if (!role) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Role "${input.roleSlug}" not found` });
        }
        roleId = role.id;
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: input.id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.displayName !== undefined && { displayName: input.displayName || null }),
            ...(input.bio !== undefined && { bio: input.bio || null }),
          },
        }),
        ...(roleId
          ? [
              prisma.userSite.update({
                where: { userId_siteId: { userId: input.id, siteId: ctx.auth.siteId } },
                data: { roleId },
              }),
            ]
          : []),
      ]);

      return { success: true };
    }),

  /** Create a new user on the current site */
  create: permissionProcedure("create_users")
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(1).max(200),
        roleSlug: z.string(),
        password: z.string().min(8).max(128).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { hash } = await import("bcryptjs");
      const { BCRYPT_ROUNDS } = await import(
        "@nextpress/core/auth/auth-config"
      );

      const role = await prisma.role.findUnique({
        where: { slug: input.roleSlug },
      });
      if (!role) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Role "${input.roleSlug}" not found`,
        });
      }

      // Prevent privilege escalation
      if (
        input.roleSlug === "admin" &&
        ctx.auth.role !== "super_admin" &&
        ctx.auth.role !== "admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can create admin users",
        });
      }

      const passwordHash = input.password
        ? await hash(input.password, BCRYPT_ROUNDS)
        : null;

      const user = await prisma.user.create({
        data: {
          email: input.email.toLowerCase().trim(),
          name: input.name,
          passwordHash,
          sites: {
            create: {
              siteId: ctx.auth.siteId,
              roleId: role.id,
            },
          },
        },
        select: { id: true, email: true, name: true },
      });

      return user;
    }),

  /** Remove a user from the current site */
  delete: permissionProcedure("delete_users")
    .input(z.object({ userId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.auth.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete your own account",
        });
      }

      await prisma.userSite.delete({
        where: {
          userId_siteId: {
            userId: input.userId,
            siteId: ctx.auth.siteId,
          },
        },
      });

      return { success: true };
    }),
});
