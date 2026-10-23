"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button, EmptyState, FormField, useToast } from "@nextpress/ui";

/** The subset of JSON Schema that theme.json settings use. */
export interface SettingProperty {
  type?: "string" | "number" | "integer" | "boolean";
  enum?: Array<string | number>;
  default?: unknown;
  title?: string;
  description?: string;
}

type Values = Record<string, unknown>;

/** "showSidebar" -> "Show sidebar" */
const humanize = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase()).replace(/ (\w)/g, (_, c: string) => ` ${c.toLowerCase()}`);

const isColor = (key: string, p: SettingProperty, v: unknown) =>
  p.type === "string" && (/colou?r/i.test(key) || (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v)));

function defaultsFor(properties: Record<string, SettingProperty>): Values {
  return Object.fromEntries(Object.entries(properties).map(([k, p]) => [k, p.default ?? (p.type === "boolean" ? false : p.type === "number" || p.type === "integer" ? 0 : "")]));
}

export function Customizer({ properties, initialValues }: { properties: Record<string, SettingProperty>; initialValues: Values }) {
  const router = useRouter();
  const { toast } = useToast();
  const defaults = useMemo(() => defaultsFor(properties), [properties]);
  const [values, setValues] = useState<Values>({ ...defaults, ...initialValues });
  const [dirty, setDirty] = useState(false);

  const save = trpc.theme.updateCustomizations.useMutation({
    onSuccess: () => { toast("success", "Customizations saved"); setDirty(false); router.refresh(); },
    onError: (e) => toast("error", e.message),
  });

  const keys = Object.keys(properties);
  if (keys.length === 0) {
    return <EmptyState title="Nothing to customize" description="The active theme does not declare any settings in its theme.json." />;
  }

  const set = (k: string, v: unknown) => { setValues((prev) => ({ ...prev, [k]: v })); setDirty(true); };

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border bg-white p-6"
      onSubmit={(e) => {
        e.preventDefault();
        // Persist only declared settings so stale keys from an old theme version drop out.
        save.mutate({ customizations: Object.fromEntries(keys.map((k) => [k, values[k]])) });
      }}
    >
      {keys.map((key) => {
        const p = properties[key]!;
        const v = values[key];
        const id = `setting-${key}`;
        const label = p.title ?? humanize(key);

        if (p.type === "boolean") {
          return (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
              <input id={id} type="checkbox" checked={Boolean(v)} onChange={(e) => set(key, e.target.checked)} />
              {label}
              {p.description && <span className="text-xs text-gray-400">{p.description}</span>}
            </label>
          );
        }

        let control: React.ReactNode;
        if (p.enum) {
          control = (
            <select id={id} value={String(v ?? "")} onChange={(e) => set(key, typeof p.enum![0] === "number" ? Number(e.target.value) : e.target.value)} className="np-input w-full">
              {p.enum.map((opt) => <option key={String(opt)} value={String(opt)}>{humanize(String(opt))}</option>)}
            </select>
          );
        } else if (p.type === "number" || p.type === "integer") {
          control = (
            <input id={id} type="number" step={p.type === "integer" ? 1 : "any"} value={v === undefined || v === null ? "" : String(v)} onChange={(e) => set(key, e.target.value === "" ? null : Number(e.target.value))} className="np-input w-40" />
          );
        } else if (isColor(key, p, v)) {
          control = (
            <div className="flex items-center gap-2">
              <input id={id} type="color" value={String(v || "#000000")} onChange={(e) => set(key, e.target.value)} className="h-9 w-12 cursor-pointer rounded border" />
              <input aria-label={`${label} hex value`} value={String(v ?? "")} onChange={(e) => set(key, e.target.value)} className="np-input w-32 font-mono" />
            </div>
          );
        } else {
          control = <input id={id} value={String(v ?? "")} onChange={(e) => set(key, e.target.value)} className="np-input w-full" />;
        }

        return (
          <FormField key={key} label={label} htmlFor={id} description={p.description}>
            {control}
          </FormField>
        );
      })}

      <div className="flex items-center justify-between border-t pt-4">
        <Button type="button" variant="ghost" onClick={() => { setValues(defaults); setDirty(true); }}>
          Reset to defaults
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!dirty}>Save</Button>
      </div>
    </form>
  );
}
