/**
 * Shared form-definition schema and dynamic submission validator.
 *
 * A form is a list of typed fields authored in the block editor. This module
 * is the single source of truth for what a field can be, and it builds a Zod
 * validator at submission time from whatever fields the admin configured —
 * so validation always matches the rendered form.
 */

import { z } from "zod";

/** Supported input types for the form builder. */
export const FIELD_TYPES = [
  "text",
  "email",
  "textarea",
  "tel",
  "url",
  "number",
  "select",
  "checkbox",
  "radio",
  "date",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** A single option for select / radio fields. */
export const fieldOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

/** Definition of one field within a form. */
export const formFieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Field name must be a valid identifier"),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(fieldOptionSchema).optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
});

export type FormField = z.infer<typeof formFieldSchema>;

/** Attributes stored on the form-generator block instance. */
export const formGeneratorSchema = z.object({
  formTitle: z.string().default("Contact Us"),
  formDescription: z.string().default(""),
  fields: z.array(formFieldSchema).default([
    { name: "name", type: "text", label: "Name", required: true },
    { name: "email", type: "email", label: "Email", required: true },
    { name: "message", type: "textarea", label: "Message", required: true },
  ]),
  submitLabel: z.string().default("Send"),
  successMessage: z
    .string()
    .default("Thank you! Your submission has been received."),
});

export type FormGeneratorAttributes = z.infer<typeof formGeneratorSchema>;

/** Default attributes for a freshly-inserted block. */
export const defaultFormAttributes: FormGeneratorAttributes = {
  formTitle: "Contact Us",
  formDescription: "",
  fields: [
    { name: "name", type: "text", label: "Name", required: true },
    { name: "email", type: "email", label: "Email", required: true },
    { name: "message", type: "textarea", label: "Message", required: true },
  ],
  submitLabel: "Send",
  successMessage: "Thank you! Your submission has been received.",
};

/** Reserved payload keys that are not user fields. */
export const RESERVED_KEYS = new Set(["_np_ts", "_recaptcha_token"]);

/**
 * Build a Zod validator for a submission from the form's field definitions.
 * Unknown extra keys (honeypot, timestamp, token) are stripped by the caller
 * before validation.
 */
export function buildSubmissionValidator(fields: FormField[]): z.ZodType {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let schema: z.ZodTypeAny;

    switch (field.type) {
      case "email":
        schema = z.string().email("Please enter a valid email address");
        break;
      case "url":
        schema = z.string().url("Please enter a valid URL");
        break;
      case "number":
        schema = z.coerce.number({ invalid_type_error: "Must be a number" });
        break;
      case "checkbox":
        schema = z
          .union([z.boolean(), z.string()])
          .transform((v) => v === true || v === "on" || v === "true");
        break;
      case "select":
      case "radio": {
        const values = (field.options ?? []).map((o) => o.value);
        schema =
          values.length > 0
            ? z.string().refine((v) => values.includes(v), {
                message: "Invalid selection",
              })
            : z.string();
        break;
      }
      case "textarea":
      case "text":
      case "tel":
      case "date":
      default:
        schema = z.string();
        break;
    }

    // Apply string-length constraints where relevant.
    if (schema instanceof z.ZodString) {
      if (typeof field.minLength === "number") {
        schema = (schema as z.ZodString).min(field.minLength);
      }
      // Sane upper bound to prevent oversized payloads even if unset.
      const max = field.maxLength ?? 5000;
      schema = (schema as z.ZodString).max(max);
    }

    // Required vs optional.
    if (field.required) {
      if (schema instanceof z.ZodString) {
        schema = (schema as z.ZodString).min(1, `${field.label} is required`);
      }
    } else {
      schema = schema.optional();
    }

    shape[field.name] = schema;
  }

  return z.object(shape).strip();
}

/** Strip reserved / non-field keys from a raw submission body. */
export function extractFieldValues(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!RESERVED_KEYS.has(key) && !key.startsWith("np_hp_")) {
      out[key] = value;
    }
  }
  return out;
}
