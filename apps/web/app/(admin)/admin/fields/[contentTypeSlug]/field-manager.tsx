"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button, ConfirmDialog, EmptyState, FormField, useToast } from "@nextpress/ui";
import type { FieldDefinitionDto, FieldTypeInput } from "@nextpress/core/fields/field-types";

const FIELD_TYPES: Array<{ value: FieldTypeInput; label: string }> = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Textarea" },
  { value: "RICHTEXT", label: "Rich text" },
  { value: "NUMBER", label: "Number" },
  { value: "BOOLEAN", label: "Yes / No" },
  { value: "DATE", label: "Date" },
  { value: "DATETIME", label: "Date and time" },
  { value: "SELECT", label: "Select" },
  { value: "MULTISELECT", label: "Multi-select" },
  { value: "MEDIA", label: "Media" },
  { value: "RELATION", label: "Relation" },
  { value: "COLOR", label: "Colour" },
  { value: "URL", label: "URL" },
  { value: "EMAIL", label: "Email" },
  { value: "JSON", label: "JSON" },
];

const HAS_OPTIONS = new Set<FieldTypeInput>(["SELECT", "MULTISELECT"]);
const typeLabel = (t: FieldTypeInput) => FIELD_TYPES.find((f) => f.value === t)?.label ?? t;

/** "Red, green" -> [{label:"Red",value:"red"}, ...]; "Label=value" keeps an explicit value. */
function parseOptions(text: string) {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [label, value] = s.includes("=") ? s.split("=").map((p) => p.trim()) : [s, s];
      return { label: label!, value: (value || label!).toLowerCase().replace(/\s+/g, "_") };
    });
}

const optionsToText = (opts: FieldDefinitionDto["options"]) =>
  (opts ?? []).map((o) => (o.value === o.label.toLowerCase().replace(/\s+/g, "_") ? o.label : `${o.label}=${o.value}`)).join("\n");

interface Draft {
  key: string;
  name: string;
  fieldType: FieldTypeInput;
  group: string;
  description: string;
  isRequired: boolean;
  options: string;
}

const emptyDraft: Draft = { key: "", name: "", fieldType: "TEXT", group: "custom-fields", description: "", isRequired: false, options: "" };

export function FieldManager({ contentTypeId, initialFields }: { contentTypeId: string; initialFields: FieldDefinitionDto[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [keyTouched, setKeyTouched] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Omit<Draft, "key" | "fieldType"> | null>(null);
  const [deleting, setDeleting] = useState<FieldDefinitionDto | null>(null);

  const refresh = () => router.refresh();
  const create = trpc.field.create.useMutation({
    onSuccess: () => { toast("success", "Field added"); setDraft(emptyDraft); setKeyTouched(false); refresh(); },
    onError: (e) => toast("error", e.message),
  });
  const update = trpc.field.update.useMutation({
    onSuccess: () => { toast("success", "Field saved"); setEditingId(null); refresh(); },
    onError: (e) => toast("error", e.message),
  });
  const remove = trpc.field.delete.useMutation({
    onSuccess: () => { toast("success", "Field deleted"); refresh(); },
    onError: (e) => toast("error", e.message),
  });

  const groups = useMemo(() => {
    const map = new Map<string, FieldDefinitionDto[]>();
    for (const f of initialFields) map.set(f.group, [...(map.get(f.group) ?? []), f]);
    return [...map.entries()];
  }, [initialFields]);

  const autoKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {groups.length === 0 && <EmptyState title="No fields yet" description="Add the first field with the form on the right." />}
        {groups.map(([group, fields]) => (
          <section key={group} className="overflow-hidden rounded-lg border bg-white">
            <h2 className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">{group}</h2>
            <ul className="divide-y">
              {fields.map((f) => {
                const isGlobal = f.contentTypeId === null;
                if (editingId === f.id && edit) {
                  return (
                    <li key={f.id} className="space-y-3 p-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <FormField label="Name" htmlFor={`n-${f.id}`}>
                          <input id={`n-${f.id}`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="np-input w-full" />
                        </FormField>
                        <FormField label="Group" htmlFor={`g-${f.id}`}>
                          <input id={`g-${f.id}`} value={edit.group} onChange={(e) => setEdit({ ...edit, group: e.target.value })} className="np-input w-full" />
                        </FormField>
                      </div>
                      <FormField label="Description" htmlFor={`d-${f.id}`}>
                        <input id={`d-${f.id}`} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className="np-input w-full" />
                      </FormField>
                      {HAS_OPTIONS.has(f.fieldType) && (
                        <FormField label="Options" htmlFor={`o-${f.id}`} description="One per line. Use Label=value to set the stored value.">
                          <textarea id={`o-${f.id}`} rows={3} value={edit.options} onChange={(e) => setEdit({ ...edit, options: e.target.value })} className="np-input w-full" />
                        </FormField>
                      )}
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={edit.isRequired} onChange={(e) => setEdit({ ...edit, isRequired: e.target.checked })} /> Required
                      </label>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                        <Button
                          size="sm"
                          loading={update.isPending}
                          onClick={() =>
                            update.mutate({
                              id: f.id,
                              data: {
                                name: edit.name,
                                group: edit.group || "custom-fields",
                                description: edit.description || undefined,
                                isRequired: edit.isRequired,
                                ...(HAS_OPTIONS.has(f.fieldType) ? { options: parseOptions(edit.options) } : {}),
                              },
                            })
                          }
                        >
                          Save
                        </Button>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={f.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium text-gray-900">
                        {f.name}
                        {f.isRequired && <span className="text-xs text-red-500">required</span>}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        <code>{f.key}</code> · {typeLabel(f.fieldType)}
                        {isGlobal && " · site-wide"}
                        {f.source !== "core" && ` · from ${f.source}`}
                        {f.description && ` · ${f.description}`}
                      </div>
                    </div>
                    {!isGlobal && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(f.id);
                            setEdit({ name: f.name, group: f.group, description: f.description ?? "", isRequired: f.isRequired, options: optionsToText(f.options) });
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleting(f)}>Delete</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <form
        className="h-fit space-y-3 rounded-lg border bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            contentTypeId,
            key: draft.key,
            name: draft.name,
            fieldType: draft.fieldType,
            group: draft.group || "custom-fields",
            description: draft.description || undefined,
            isRequired: draft.isRequired,
            sortOrder: initialFields.length,
            ...(HAS_OPTIONS.has(draft.fieldType) ? { options: parseOptions(draft.options) } : {}),
          });
        }}
      >
        <h2 className="text-sm font-semibold text-gray-900">Add field</h2>
        <FormField label="Name" htmlFor="new-name" required>
          <input
            id="new-name"
            value={draft.name}
            required
            onChange={(e) => setDraft({ ...draft, name: e.target.value, key: keyTouched ? draft.key : autoKey(e.target.value) })}
            className="np-input w-full"
          />
        </FormField>
        <FormField label="Key" htmlFor="new-key" required description="Lowercase letters, numbers and underscores. Cannot be changed later.">
          <input
            id="new-key"
            value={draft.key}
            required
            pattern="[a-z][a-z0-9_]*"
            onChange={(e) => { setKeyTouched(true); setDraft({ ...draft, key: e.target.value }); }}
            className="np-input w-full font-mono"
          />
        </FormField>
        <FormField label="Type" htmlFor="new-type">
          <select id="new-type" value={draft.fieldType} onChange={(e) => setDraft({ ...draft, fieldType: e.target.value as FieldTypeInput })} className="np-input w-full">
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FormField>
        {HAS_OPTIONS.has(draft.fieldType) && (
          <FormField label="Options" htmlFor="new-options" required description="One per line. Use Label=value to set the stored value.">
            <textarea id="new-options" rows={3} value={draft.options} required onChange={(e) => setDraft({ ...draft, options: e.target.value })} className="np-input w-full" />
          </FormField>
        )}
        <FormField label="Group" htmlFor="new-group">
          <input id="new-group" value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })} className="np-input w-full" />
        </FormField>
        <FormField label="Description" htmlFor="new-desc">
          <input id="new-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="np-input w-full" />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={draft.isRequired} onChange={(e) => setDraft({ ...draft, isRequired: e.target.checked })} /> Required
        </label>
        <Button type="submit" className="w-full" loading={create.isPending}>Add field</Button>
      </form>

      <ConfirmDialog
        open={!!deleting}
        title={`Delete "${deleting?.name}"?`}
        description="Values stored in this field on existing entries are removed too."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => { if (deleting) await remove.mutateAsync({ id: deleting.id }); setDeleting(null); }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
