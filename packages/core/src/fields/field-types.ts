import { z } from "zod";

// ── FieldType enum (mirrors Prisma but as a Zod enum for validation) ──

export const fieldTypeSchema = z.enum([
  "TEXT",
  "TEXTAREA",
  "RICHTEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTISELECT",
  "MEDIA",
  "RELATION",
  "COLOR",
  "URL",
  "EMAIL",
  "JSON",
]);

export type FieldTypeInput = z.infer<typeof fieldTypeSchema>;

// ── Select option schema ──

export const selectOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

// ── Validation rule schema (per field type) ──

export const fieldValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().int().optional(),
    maxLength: z.number().int().optional(),
    precision: z.number().int().min(0).max(10).optional(),
    pattern: z.string().optional(),
    accept: z.string().optional(),       // MEDIA: mime types
    maxFiles: z.number().int().optional(), // MEDIA: max selections
    contentType: z.string().optional(),   // RELATION: target content type slug
    maxItems: z.number().int().optional(), // RELATION: max references
  })
  .optional();

// ── Input DTOs ──

export const createFieldDefinitionSchema = z.object({
  contentTypeId: z.string().cuid().optional().nullable(),
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Must start with letter, contain only lowercase alphanumeric and underscores",
    ),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  fieldType: fieldTypeSchema,
  isRequired: z.boolean().default(false),
  defaultValue: z.unknown().optional().nullable(),
  validation: fieldValidationSchema,
  options: z.array(selectOptionSchema).optional().nullable(),
  group: z.string().max(100).default("custom-fields"),
  sortOrder: z.number().int().min(0).default(0),
});

// z.input, not z.infer: the service parses this itself, so callers may omit
// fields the schema defaults (group, isRequired, sortOrder).
export type CreateFieldDefinitionInput = z.input<
  typeof createFieldDefinitionSchema
>;

export const updateFieldDefinitionSchema = createFieldDefinitionSchema
  .partial()
  .omit({ key: true, contentTypeId: true });

export type UpdateFieldDefinitionInput = z.infer<
  typeof updateFieldDefinitionSchema
>;

// ── Output DTO ──

export interface FieldDefinitionDto {
  id: string;
  siteId: string;
  contentTypeId: string | null;
  key: string;
  name: string;
  description: string | null;
  fieldType: FieldTypeInput;
  isRequired: boolean;
  defaultValue: unknown;
  validation: Record<string, unknown> | null;
  options: Array<{ label: string; value: string }> | null;
  group: string;
  sortOrder: number;
  source: string;
}
