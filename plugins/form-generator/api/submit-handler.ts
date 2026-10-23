/**
 * Secure form submission handler.
 *
 * Runs a defense-in-depth pipeline on every public submission:
 *
 *   1. Method + payload sanity   — reject anything that isn't a small JSON POST.
 *   2. Rate limiting (per IP)    — blunts flooding / basic DDoS.
 *   3. Honeypot + time trap      — catches naive bots for free.
 *   4. Google reCAPTCHA          — optional admin-configured human check.
 *   5. Schema validation (Zod)   — dynamic, matches the authored form.
 *   6. Persist + notify          — store submission, fire hook, respond.
 *
 * The handler is created via a factory so it closes over the plugin's
 * settings accessor and an optional persistence callback, keeping it fully
 * unit-testable without a live CMS.
 */

import {
  buildSubmissionValidator,
  extractFieldValues,
  formFieldSchema,
  type FormField,
} from "../lib/form-schema";
import { checkRateLimit, resolveClientIp } from "../lib/rate-limiter";
import { checkSpamHeuristics } from "../lib/spam-guard";
import { verifyRecaptcha, type RecaptchaConfig } from "../lib/recaptcha";
import { z } from "zod";

export interface FormGeneratorSettings {
  recipientEmail?: string;
  successMessage?: string;
  enableNotifications?: boolean;
  storeSubmissions?: boolean;
  recaptchaEnabled?: boolean;
  recaptchaVersion?: string;
  recaptchaSiteKey?: string;
  recaptchaSecretKey?: string;
  recaptchaMinScore?: number;
  rateLimitMax?: number;
  rateLimitWindowSeconds?: number;
  honeypotField?: string;
  minSubmitSeconds?: number;
}

/** Data passed to the persistence callback for a clean submission. */
export interface StoredSubmission {
  title: string;
  fields: Record<string, unknown>;
  values: Record<string, unknown>;
  ip: string;
  source: string | null;
  formId: string | null;
}

export interface SubmitHandlerDeps {
  /** Reads the plugin settings for the current site. */
  getSettings: () => Promise<FormGeneratorSettings>;
  /** Persists a validated submission. Optional (settings can disable storage). */
  persist?: (submission: StoredSubmission) => Promise<void>;
  /** Fired after a successful submission (notifications, hooks). */
  onSuccess?: (submission: StoredSubmission) => Promise<void> | void;
}

const MAX_BODY_BYTES = 64 * 1024; // 64 KB is plenty for a form.

/** The client posts the form fields inline plus these control keys. */
const envelopeSchema = z.object({
  _np_ts: z.union([z.number(), z.string()]).optional(),
  _recaptcha_token: z.string().optional(),
  _form_id: z.string().optional(),
  _fields: z.array(formFieldSchema).optional(),
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Never cache submission responses.
      "Cache-Control": "no-store",
    },
  });
}

function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: "Too many submissions. Please slow down and try again shortly.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

/**
 * Create the POST handler. The returned function matches the plugin API route
 * contract: `(req: Request) => Promise<Response>`.
 */
export function createSubmitHandler(deps: SubmitHandlerDeps) {
  return async function handleSubmit(req: Request): Promise<Response> {
    // 1. Method + content-type + size guards.
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return json({ error: "Expected application/json" }, 415);
    }
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BODY_BYTES) {
      return json({ error: "Payload too large" }, 413);
    }

    let raw: string;
    try {
      raw = await req.text();
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }
    if (raw.length > MAX_BODY_BYTES) {
      return json({ error: "Payload too large" }, 413);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json({ error: "Invalid submission" }, 400);
    }

    const settings = await deps.getSettings();
    const ip = resolveClientIp(req);

    // 2. Rate limit per IP.
    const rl = checkRateLimit(
      `form:${ip}`,
      settings.rateLimitMax ?? 5,
      settings.rateLimitWindowSeconds ?? 60,
    );
    if (!rl.allowed) {
      return rateLimitResponse(rl.retryAfter);
    }

    // Parse control envelope (timestamp, token, field defs).
    const envelope = envelopeSchema.safeParse(body);
    const control = envelope.success ? envelope.data : {};

    // 3. Honeypot + time trap. Silently accept to avoid teaching bots.
    const spam = checkSpamHeuristics(body, {
      honeypotField: settings.honeypotField ?? "np_hp_email",
      minSubmitSeconds: settings.minSubmitSeconds ?? 3,
    });
    if (spam.spam) {
      // Return a generic success so bots can't distinguish rejection.
      return json(
        {
          success: true,
          message: settings.successMessage ?? "Thank you!",
        },
        200,
      );
    }

    // 4. reCAPTCHA (optional).
    const recaptchaConfig: RecaptchaConfig = {
      enabled: Boolean(settings.recaptchaEnabled),
      version: settings.recaptchaVersion === "v3" ? "v3" : "v2",
      secretKey: settings.recaptchaSecretKey ?? "",
      minScore: settings.recaptchaMinScore ?? 0.5,
    };
    const captcha = await verifyRecaptcha(
      recaptchaConfig,
      control._recaptcha_token,
      ip,
    );
    if (!captcha.success) {
      return json(
        { error: captcha.reason ?? "reCAPTCHA verification failed." },
        400,
      );
    }

    // 5. Dynamic schema validation from the authored field definitions.
    const fieldDefs: FormField[] = control._fields ?? [];
    const values = extractFieldValues(body);
    if (fieldDefs.length > 0) {
      const validator = buildSubmissionValidator(fieldDefs);
      const result = validator.safeParse(values);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        return json(
          {
            error: firstIssue?.message ?? "Please check the form and try again.",
            field: firstIssue?.path?.join("."),
          },
          422,
        );
      }
    }

    // Build a friendly title from the first identifying value.
    const identity =
      (values.email as string) ||
      (values.name as string) ||
      (values.subject as string) ||
      "Submission";
    const submission: StoredSubmission = {
      title: `${identity} — ${new Date().toISOString().slice(0, 10)}`,
      fields: {
        submission_ip: ip,
        form_source: req.headers.get("referer"),
        payload: values,
        is_read: false,
      },
      values,
      ip,
      source: req.headers.get("referer"),
      formId: control._form_id ?? null,
    };

    // 6. Persist (if enabled) + side effects.
    try {
      if (settings.storeSubmissions !== false && deps.persist) {
        await deps.persist(submission);
      }
      if (deps.onSuccess) {
        await deps.onSuccess(submission);
      }
    } catch (err) {
      // Do not leak internals; the visitor's data is still validated.
      console.error("[form-generator] Failed to store submission:", err);
      return json(
        { error: "We couldn't save your submission. Please try again." },
        500,
      );
    }

    return json(
      {
        success: true,
        message:
          settings.successMessage ??
          "Thank you! Your submission has been received.",
      },
      200,
    );
  };
}
