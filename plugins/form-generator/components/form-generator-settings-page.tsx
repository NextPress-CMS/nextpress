"use client";

import { useEffect, useState } from "react";

/**
 * Admin settings page for Form Generator.
 *
 * Lets an admin enable Google reCAPTCHA (v2 or v3), paste the site/secret
 * keys, and tune the anti-spam / anti-flood thresholds. Values are persisted
 * to the plugin settings group (`plugin:form-generator`) via the settings API.
 *
 * The host admin shell is expected to mount this at
 * `/admin/settings/form-generator` (see README → Installation).
 */

interface Settings {
  recipientEmail: string;
  successMessage: string;
  enableNotifications: boolean;
  storeSubmissions: boolean;
  recaptchaEnabled: boolean;
  recaptchaVersion: "v2" | "v3";
  recaptchaSiteKey: string;
  recaptchaSecretKey: string;
  recaptchaMinScore: number;
  rateLimitMax: number;
  rateLimitWindowSeconds: number;
  honeypotField: string;
  minSubmitSeconds: number;
}

const DEFAULTS: Settings = {
  recipientEmail: "",
  successMessage: "Thank you! Your submission has been received.",
  enableNotifications: true,
  storeSubmissions: true,
  recaptchaEnabled: false,
  recaptchaVersion: "v2",
  recaptchaSiteKey: "",
  recaptchaSecretKey: "",
  recaptchaMinScore: 0.5,
  rateLimitMax: 5,
  rateLimitWindowSeconds: 60,
  honeypotField: "np_hp_email",
  minSubmitSeconds: 3,
};

const SETTINGS_URL = "/api/v1/settings?group=plugin:form-generator";

export default function FormGeneratorSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">(
    "loading",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(SETTINGS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return;
        const values = (data?.data ?? data ?? {}) as Partial<Settings>;
        setSettings({ ...DEFAULTS, ...values });
        setStatus("idle");
      })
      .catch(() => {
        if (active) setStatus("idle");
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const res = await fetch(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: "plugin:form-generator", values: settings }),
      });
      if (!res.ok) throw new Error("Save failed");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setError("Could not save settings. Check your permissions and try again.");
    }
  }

  if (status === "loading") {
    return <div className="p-6 text-gray-500">Loading settings…</div>;
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Form Generator</h1>
        <p className="text-gray-500">
          Configure notifications, spam protection, and Google reCAPTCHA.
        </p>
      </div>

      {/* ── General ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium border-b pb-1">General</h2>
        <Field label="Notification email">
          <input
            type="email"
            value={settings.recipientEmail}
            onChange={(e) => update("recipientEmail", e.target.value)}
            className="np-input w-full"
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Success message">
          <input
            type="text"
            value={settings.successMessage}
            onChange={(e) => update("successMessage", e.target.value)}
            className="np-input w-full"
          />
        </Field>
        <Toggle
          label="Email notifications on new submissions"
          checked={settings.enableNotifications}
          onChange={(v) => update("enableNotifications", v)}
        />
        <Toggle
          label="Store submissions in the admin inbox"
          checked={settings.storeSubmissions}
          onChange={(v) => update("storeSubmissions", v)}
        />
      </section>

      {/* ── reCAPTCHA ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium border-b pb-1">Google reCAPTCHA</h2>
        <Toggle
          label="Enable reCAPTCHA"
          checked={settings.recaptchaEnabled}
          onChange={(v) => update("recaptchaEnabled", v)}
        />
        {settings.recaptchaEnabled && (
          <div className="space-y-4 pl-1">
            <Field label="Version">
              <select
                value={settings.recaptchaVersion}
                onChange={(e) =>
                  update("recaptchaVersion", e.target.value as "v2" | "v3")
                }
                className="np-input w-full"
              >
                <option value="v2">v2 (checkbox / invisible)</option>
                <option value="v3">v3 (score-based)</option>
              </select>
            </Field>
            <Field label="Site key">
              <input
                type="text"
                value={settings.recaptchaSiteKey}
                onChange={(e) => update("recaptchaSiteKey", e.target.value)}
                className="np-input w-full"
                placeholder="6Lc..."
              />
            </Field>
            <Field label="Secret key">
              <input
                type="password"
                value={settings.recaptchaSecretKey}
                onChange={(e) => update("recaptchaSecretKey", e.target.value)}
                className="np-input w-full"
                placeholder="6Lc..."
                autoComplete="off"
              />
            </Field>
            {settings.recaptchaVersion === "v3" && (
              <Field label={`Minimum score (${settings.recaptchaMinScore})`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={settings.recaptchaMinScore}
                  onChange={(e) =>
                    update("recaptchaMinScore", Number(e.target.value))
                  }
                  className="w-full"
                />
              </Field>
            )}
            <p className="text-xs text-gray-500">
              Get your keys from{" "}
              <a
                href="https://www.google.com/recaptcha/admin"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                the Google reCAPTCHA admin console
              </a>
              . The secret key never leaves your server.
            </p>
          </div>
        )}
      </section>

      {/* ── Spam & flood protection ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium border-b pb-1">
          Spam &amp; flood protection
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max submissions per window">
            <input
              type="number"
              min={1}
              value={settings.rateLimitMax}
              onChange={(e) => update("rateLimitMax", Number(e.target.value))}
              className="np-input w-full"
            />
          </Field>
          <Field label="Window (seconds)">
            <input
              type="number"
              min={1}
              value={settings.rateLimitWindowSeconds}
              onChange={(e) =>
                update("rateLimitWindowSeconds", Number(e.target.value))
              }
              className="np-input w-full"
            />
          </Field>
          <Field label="Honeypot field name">
            <input
              type="text"
              value={settings.honeypotField}
              onChange={(e) => update("honeypotField", e.target.value)}
              className="np-input w-full"
            />
          </Field>
          <Field label="Min seconds before submit">
            <input
              type="number"
              min={0}
              value={settings.minSubmitSeconds}
              onChange={(e) =>
                update("minSubmitSeconds", Number(e.target.value))
              }
              className="np-input w-full"
            />
          </Field>
        </div>
        <p className="text-xs text-gray-500">
          Rate limiting throttles floods per IP. The honeypot and time-trap
          silently drop automated bots. Together they blunt spam and basic
          denial-of-service attempts before any heavy work runs.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="np-btn np-btn-primary np-btn-md"
        >
          {status === "saving" ? "Saving…" : "Save settings"}
        </button>
        {status === "saved" && (
          <span className="text-green-600 text-sm">Saved ✓</span>
        )}
        {status === "error" && (
          <span className="text-red-600 text-sm">{error}</span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
