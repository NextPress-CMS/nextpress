"use client";

import { useState } from "react";
import type { BlockEditProps } from "@nextpress/blocks";

type FieldType =
  | "text"
  | "email"
  | "textarea"
  | "tel"
  | "url"
  | "number"
  | "select"
  | "checkbox"
  | "radio"
  | "date";

interface FieldOption {
  label: string;
  value: string;
}

interface FormField {
  name: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: FieldOption[];
}

interface FormAttributes {
  formTitle: string;
  formDescription: string;
  fields: FormField[];
  submitLabel: string;
  successMessage: string;
}

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "textarea", label: "Textarea" },
  { value: "tel", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "radio", label: "Radio group" },
  { value: "date", label: "Date" },
];

const NEEDS_OPTIONS = new Set<FieldType>(["select", "radio"]);

let fieldCounter = 0;
function nextFieldName(existing: FormField[]): string {
  fieldCounter += 1;
  let name = `field_${fieldCounter}`;
  const taken = new Set(existing.map((f) => f.name));
  while (taken.has(name)) {
    fieldCounter += 1;
    name = `field_${fieldCounter}`;
  }
  return name;
}

export default function FormGeneratorEdit({
  attributes,
  setAttributes,
  isSelected,
}: BlockEditProps) {
  const attrs = attributes as unknown as FormAttributes;
  const fields = attrs.fields ?? [];
  const [openField, setOpenField] = useState<number | null>(null);

  function updateField(index: number, patch: Partial<FormField>) {
    const next = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    setAttributes({ fields: next } as never);
  }

  function addField() {
    const next: FormField[] = [
      ...fields,
      {
        name: nextFieldName(fields),
        type: "text",
        label: "New Field",
        required: false,
      },
    ];
    setAttributes({ fields: next } as never);
    setOpenField(next.length - 1);
  }

  function removeField(index: number) {
    setAttributes({ fields: fields.filter((_, i) => i !== index) } as never);
    setOpenField(null);
  }

  function moveField(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    setAttributes({ fields: next } as never);
  }

  function updateOptions(index: number, raw: string) {
    const options: FieldOption[] = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, value] = line.split("|").map((s) => s.trim());
        return { label: label!, value: (value ?? label)! };
      });
    updateField(index, { options });
  }

  if (!isSelected) {
    return (
      <div className="np-form-generator-edit border-2 border-dashed border-gray-300 rounded-sm p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">📝</span>
          <span className="font-medium">
            {attrs.formTitle || "Form Generator"}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {fields.length} field{fields.length === 1 ? "" : "s"} · click to edit
        </p>
      </div>
    );
  }

  return (
    <div className="np-form-generator-edit border-2 border-blue-300 rounded-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">📝</span>
        <span className="font-medium">Form Generator</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <input
          type="text"
          value={attrs.formTitle ?? ""}
          onChange={(e) => setAttributes({ formTitle: e.target.value } as never)}
          className="np-input w-full"
          placeholder="Form title"
        />
        <input
          type="text"
          value={attrs.formDescription ?? ""}
          onChange={(e) =>
            setAttributes({ formDescription: e.target.value } as never)
          }
          className="np-input w-full"
          placeholder="Description (optional)"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Fields</span>
          <button
            type="button"
            onClick={addField}
            className="np-btn np-btn-secondary np-btn-sm"
          >
            + Add field
          </button>
        </div>

        {fields.map((field, index) => (
          <div key={field.name} className="border rounded-sm p-2 bg-gray-50">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setOpenField(openField === index ? null : index)
                }
                className="flex-1 text-left text-sm font-medium"
              >
                {field.label || field.name}{" "}
                <span className="text-gray-400">({field.type})</span>
                {field.required && <span className="text-red-500"> *</span>}
              </button>
              <button
                type="button"
                onClick={() => moveField(index, -1)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveField(index, 1)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeField(index)}
                className="text-red-400 hover:text-red-600"
                aria-label="Remove field"
              >
                ✕
              </button>
            </div>

            {openField === index && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs col-span-2">
                  Label
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) =>
                      updateField(index, { label: e.target.value })
                    }
                    className="np-input w-full"
                  />
                </label>
                <label className="text-xs">
                  Name
                  <input
                    type="text"
                    value={field.name}
                    onChange={(e) =>
                      updateField(index, {
                        name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"),
                      })
                    }
                    className="np-input w-full"
                  />
                </label>
                <label className="text-xs">
                  Type
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateField(index, { type: e.target.value as FieldType })
                    }
                    className="np-input w-full"
                  >
                    {FIELD_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs col-span-2">
                  Placeholder
                  <input
                    type="text"
                    value={field.placeholder ?? ""}
                    onChange={(e) =>
                      updateField(index, { placeholder: e.target.value })
                    }
                    className="np-input w-full"
                  />
                </label>
                {NEEDS_OPTIONS.has(field.type) && (
                  <label className="text-xs col-span-2">
                    Options (one per line, &quot;Label|value&quot;)
                    <textarea
                      rows={3}
                      value={(field.options ?? [])
                        .map((o) =>
                          o.label === o.value ? o.label : `${o.label}|${o.value}`,
                        )
                        .join("\n")}
                      onChange={(e) => updateOptions(index, e.target.value)}
                      className="np-input w-full"
                    />
                  </label>
                )}
                <label className="text-xs flex items-center gap-2 col-span-2">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) =>
                      updateField(index, { required: e.target.checked })
                    }
                  />
                  Required
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 border-t pt-3">
        <input
          type="text"
          value={attrs.submitLabel ?? ""}
          onChange={(e) =>
            setAttributes({ submitLabel: e.target.value } as never)
          }
          className="np-input w-full"
          placeholder="Submit button text"
        />
        <input
          type="text"
          value={attrs.successMessage ?? ""}
          onChange={(e) =>
            setAttributes({ successMessage: e.target.value } as never)
          }
          className="np-input w-full"
          placeholder="Success message"
        />
      </div>

      <p className="text-xs text-gray-400">
        Spam protection (honeypot, rate limiting, reCAPTCHA) is configured in
        Settings → Form Generator.
      </p>
    </div>
  );
}
