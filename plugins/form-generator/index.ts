import type { PluginDefinition } from "@nextpress/core/plugin/plugin-types";
import type { PluginContext } from "@nextpress/core/plugin/plugin-context";
import {
  formGeneratorSchema,
  defaultFormAttributes,
} from "./lib/form-schema";
import {
  createSubmitHandler,
  type FormGeneratorSettings,
  type StoredSubmission,
} from "./api/submit-handler";

/**
 * Form Generator — a free, customizable form builder for NextPress.
 *
 * A Contact Form 7-style alternative that is entirely free and open. Authors
 * drop a "Form Generator" block onto any page, configure fields visually, and
 * receive submissions in the admin. Every submission passes through a
 * defense-in-depth pipeline:
 *
 *   - Per-IP rate limiting (anti-flood / basic DDoS)
 *   - Hidden honeypot field + time-trap (anti-bot)
 *   - Optional Google reCAPTCHA v2 / v3 (admin toggle + keys)
 *   - Dynamic Zod validation matching the authored form
 *
 * reCAPTCHA keys, rate limits, and spam thresholds are all configured from the
 * plugin settings — no code changes required.
 */

// Re-export the block attribute schema so the render/edit components can infer
// their prop types from it (mirrors the contact-form convention).
export { formGeneratorSchema };

const formGenerator: PluginDefinition = {
  slug: "form-generator",

  async onActivate(ctx: PluginContext) {
    // ── Register the form builder block ──
    ctx.blocks.register({
      type: "plugin/form-generator",
      title: "Form Generator",
      description:
        "A fully customizable form with spam, flood, and reCAPTCHA protection",
      icon: "clipboard-list",
      category: "widgets",
      keywords: ["form", "contact", "generator", "input", "captcha", "survey"],
      attributesSchema: formGeneratorSchema,
      defaultAttributes: defaultFormAttributes,
      version: 1,
      allowsInnerBlocks: false,
      renderComponent: null, // Shipped as components/form-generator-block-render.tsx
    });

    // ── Register the form_submission content type (shared with contact-form
    //    naming so submissions surface in one inbox). Idempotent. ──
    try {
      await ctx.content.registerType({
        slug: "form_submission",
        nameSingular: "Form Submission",
        namePlural: "Form Submissions",
        description: "Submissions captured by Form Generator forms",
        hasArchive: false,
        isPublic: false,
        menuIcon: "inbox",
        menuPosition: 26,
        supports: ["title", "custom-fields"],
      });
    } catch {
      // Type may already exist from a previous activation or contact-form.
    }

    // ── Register fields on form_submission ──
    try {
      await ctx.content.registerFields("form_submission", [
        { key: "payload", name: "Submission Data", fieldType: "JSON" },
        { key: "form_source", name: "Source Page", fieldType: "URL" },
        { key: "submission_ip", name: "IP Address", fieldType: "TEXT" },
        {
          key: "is_read",
          name: "Read",
          fieldType: "BOOLEAN",
          defaultValue: false,
        },
      ]);
    } catch {
      // Fields may already exist.
    }

    // ── Settings accessor bound to this plugin's group + site ──
    const getSettings = async (): Promise<FormGeneratorSettings> => {
      const raw = await ctx.settings.get();
      return raw as FormGeneratorSettings;
    };

    // ── Fire notification + lifecycle hook on success ──
    const onSuccess = async (submission: StoredSubmission): Promise<void> => {
      const settings = await getSettings();
      if (settings.enableNotifications && settings.recipientEmail) {
        // Email delivery is provided by the host / a mail plugin listening on
        // this hook. We emit the intent rather than hard-coding a transport.
        console.log(
          `[form-generator] New submission "${submission.title}" → ${settings.recipientEmail}`,
        );
      }
    };

    // ── Secure submission endpoint: /api/v1/plugins/form-generator/submit ──
    //
    // Persistence is intentionally delegated to the host dispatcher route
    // (apps/web) where a site-scoped AuthContext and the content service are
    // available — the plugin sandbox has no anonymous write context. When the
    // host wires a `persist` implementation it will be used; otherwise the
    // submission is still validated, notified on, and acknowledged.
    ctx.api.registerRoute(
      "POST",
      "/submit",
      createSubmitHandler({ getSettings, onSuccess }),
    );

    // ── Public config endpoint so the browser can fetch the reCAPTCHA site
    //    key without exposing the secret key. ──
    ctx.api.registerRoute("GET", "/config", async () => {
      const settings = await getSettings();
      return new Response(
        JSON.stringify({
          recaptchaEnabled: Boolean(settings.recaptchaEnabled),
          recaptchaVersion:
            settings.recaptchaVersion === "v3" ? "v3" : "v2",
          recaptchaSiteKey: settings.recaptchaSiteKey ?? "",
          honeypotField: settings.honeypotField ?? "np_hp_email",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
          },
        },
      );
    });

    // ── Admin navigation ──
    ctx.admin.registerPage({
      slug: "form-generator-submissions",
      label: "Form Submissions",
      href: "/admin/form_submission",
      icon: "inbox",
      capability: "manage_form_submissions",
    });
    ctx.admin.registerPage({
      slug: "form-generator-settings",
      label: "Form Generator",
      href: "/admin/settings/form-generator",
      icon: "clipboard-list",
      capability: "manage_settings",
    });

    // ── Log new submissions for observability ──
    ctx.hooks.addAction("content:after_save", async (entry) => {
      if (entry.contentType.slug === "form_submission") {
        console.log(`[form-generator] Submission stored: ${entry.title}`);
      }
    });
  },

  async onDeactivate() {
    // Hooks + registrations are auto-removed by source slug.
    console.log("[form-generator] Deactivated.");
  },

  async onUninstall() {
    console.log(
      "[form-generator] Uninstalling — existing submissions are preserved in the form_submission content type.",
    );
  },
};

export default formGenerator;
