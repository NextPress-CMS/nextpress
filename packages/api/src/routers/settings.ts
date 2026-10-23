import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  authedProcedure,
  permissionProcedure,
  publicProcedure,
} from "../trpc";
import { settingsService } from "@nextpress/core/settings/settings-service";
import { updateSettingsSchema } from "@nextpress/core/settings/settings-types";

/**
 * Groups that are safe to expose without authentication. Plugin groups and
 * anything else may hold credentials (e.g. a reCAPTCHA secret), so the public
 * reader is an explicit allow-list rather than open to every group.
 */
const PUBLIC_SETTING_GROUPS = new Set(["general", "reading", "discussion", "permalinks"]);

export const settingsRouter = router({
  /** Get settings for a group (admin settings page; may include secrets) */
  getGroup: permissionProcedure("manage_settings")
    .input(z.object({ group: z.string() }))
    .query(async ({ ctx, input }) => {
      return settingsService.getGroup(ctx.auth.siteId, input.group);
    }),

  /** Get all settings (admin settings page) */
  getAll: permissionProcedure("manage_settings")
    .query(async ({ ctx }) => {
      return settingsService.getAll(ctx.auth.siteId);
    }),

  /** Get available setting groups (with field definitions) */
  getGroups: authedProcedure.query(async () => {
    return settingsService.getGroups();
  }),

  /** Update settings for a group */
  update: permissionProcedure("manage_settings")
    .input(updateSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      return settingsService.updateGroup(ctx.auth, input);
    }),

  /** Get a single setting from a public group (unauthenticated) */
  get: publicProcedure
    .input(z.object({ siteId: z.string().cuid(), group: z.string(), key: z.string() }))
    .query(async ({ input }) => {
      if (!PUBLIC_SETTING_GROUPS.has(input.group)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This settings group is not public" });
      }
      return settingsService.get(input.siteId, input.group, input.key);
    }),
});
