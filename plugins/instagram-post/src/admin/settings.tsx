"use client";

/**
 * Instagram settings screen.
 *
 * Reads and writes the plugin's settings group through a permission-gated
 * route. Only settings that change real behaviour are exposed; configuration
 * nobody uses is a maintenance cost, not a feature.
 */

import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button, PageHeader, useToast } from "@nextpress/ui";
import type { InstagramSettings, SyncInterval } from "../schemas/settings";
import { InstagramNav } from "./instagram-nav";

const SYNC_INTERVALS: Array<{ value: SyncInterval; label: string }> = [
  { value: "manual", label: "Manual only" },
  { value: "15m", label: "Every 15 minutes" },
  { value: "30m", label: "Every 30 minutes" },
  { value: "1h", label: "Hourly" },
  { value: "6h", label: "Every 6 hours" },
  { value: "12h", label: "Every 12 hours" },
  { value: "24h", label: "Daily" },
];

const SELECT_CLASS =
  "w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs transition-colors focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 disabled:bg-gray-50 disabled:text-gray-400";

export default function InstagramSettingsPage() {
  const [settings, setSettings] = useState<InstagramSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    void fetch("/api/v1/plugins/instagram-post/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: InstagramSettings | null) => setSettings(data));
  }, []);

  const update = useCallback(
    <K extends keyof InstagramSettings>(key: K, value: InstagramSettings[K]) => {
      setSettings((current) => (current ? { ...current, [key]: value } : current));
      setDirty(true);
    },
    [],
  );

  const save = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await fetch("/api/v1/plugins/instagram-post/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (response.ok) {
        setSettings(await response.json());
        setDirty(false);
        toast("success", "Settings saved.");
      } else {
        toast("error", "Settings could not be saved.");
      }
    } catch {
      toast("error", "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [settings, toast]);

  if (!settings) {
    return (
      <>
        <PageHeader title="Instagram settings" description="Synchronisation, import and publishing behaviour." />
        <InstagramNav />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
              <div className="h-4 w-32 rounded-sm bg-gray-200" />
              <div className="mt-4 h-3 w-2/3 rounded-sm bg-gray-100" />
              <div className="mt-3 h-3 w-1/2 rounded-sm bg-gray-100" />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Instagram settings"
        description="Synchronisation, import and publishing behaviour."
        actions={
          <Button onClick={() => void save()} loading={saving} disabled={!dirty || saving}>
            {!saving && <Save className="h-4 w-4" />}
            {dirty ? "Save changes" : "Saved"}
          </Button>
        }
      />
      <InstagramNav />

      <div className="space-y-4 pb-4">
        <Card
          title="Synchronisation"
          description="Instagram sends no notification when an account posts, so NextPress checks on a schedule."
        >
          <Toggle
            label="Automatically import new posts"
            checked={settings.autoSync}
            onChange={(v) => update("autoSync", v)}
          />

          <Field
            label="Sync frequency"
            hint="Shorter intervals consume more of the account's API quota."
          >
            <select
              className={SELECT_CLASS}
              value={settings.syncInterval}
              disabled={!settings.autoSync}
              onChange={(e) => update("syncInterval", e.target.value as SyncInterval)}
            >
              {SYNC_INTERVALS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </Card>

        <Card title="Import" description="How posts arrive from Instagram.">
          <Field
            label="Imported post status"
            hint="Draft is safer: it prevents an import publishing an entire back catalogue at once."
          >
            <select
              className={SELECT_CLASS}
              value={settings.importStatus}
              onChange={(e) => update("importStatus", e.target.value as "DRAFT" | "PUBLISHED")}
            >
              <option value="DRAFT">Draft, review before publishing</option>
              <option value="PUBLISHED">Published immediately</option>
            </select>
          </Field>

          <Toggle
            label="Archive media in the Media Library"
            hint="Instagram image and video URLs expire. Archiving stores a permanent copy, which is what makes the archive durable."
            checked={settings.archiveMedia}
            onChange={(v) => update("archiveMedia", v)}
          />
        </Card>

        <Card title="Publishing" description="Defaults applied when creating new content.">
          <Toggle
            label="Enable Instagram publishing on new content by default"
            checked={settings.publishByDefault}
            onChange={(v) => update("publishByDefault", v)}
          />
          <Toggle
            label="Use the entry excerpt as the Instagram caption when none is set"
            checked={settings.captionFromExcerpt}
            onChange={(v) => update("captionFromExcerpt", v)}
          />
        </Card>
      </div>
    </>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-gray-500">{hint}</span>}
    </label>
  );
}

/** Switch-style toggle: the state is readable at a glance, unlike a checkbox. */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-1 ${
          checked ? "bg-indigo-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-200 ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>

      <div className="min-w-0">
        <span className="block text-sm text-gray-800">{label}</span>
        {hint && <span className="mt-1 block text-xs leading-relaxed text-gray-500">{hint}</span>}
      </div>
    </div>
  );
}
