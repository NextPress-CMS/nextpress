"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BlockRenderProps } from "@nextpress/blocks";
import type { z } from "zod";

type FormGeneratorAttributes = z.infer<
  typeof import("../index").formGeneratorSchema
>;

interface PublicConfig {
  recaptchaEnabled: boolean;
  recaptchaVersion: "v2" | "v3";
  recaptchaSiteKey: string;
  honeypotField: string;
}

const SUBMIT_URL = "/api/v1/plugins/form-generator/submit";
const CONFIG_URL = "/api/v1/plugins/form-generator/config";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
      render?: (el: HTMLElement, opts: Record<string, unknown>) => number;
      getResponse?: (widgetId?: number) => string;
      reset?: (widgetId?: number) => void;
    };
  }
}

/** Load the Google reCAPTCHA script once. */
function useRecaptchaScript(enabled: boolean, siteKey: string, version: "v2" | "v3") {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled || !siteKey) return;
    const src =
      version === "v3"
        ? `https://www.google.com/recaptcha/api.js?render=${siteKey}`
        : `https://www.google.com/recaptcha/api.js?render=explicit`;

    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-np-recaptcha="1"]`,
    );
    if (existing) {
      setReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.npRecaptcha = "1";
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, [enabled, siteKey, version]);

  return ready;
}

export default function FormGeneratorBlock({
  attributes,
}: BlockRenderProps<FormGeneratorAttributes>) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const v2WidgetId = useRef<number | null>(null);
  const v2Container = useRef<HTMLDivElement>(null);

  // Timestamp stamped at render — powers the server-side time-trap.
  const renderedAt = useMemo(() => Date.now(), []);
  const honeypotName = config?.honeypotField ?? "np_hp_email";

  // Fetch public reCAPTCHA config (site key only; secret stays server-side).
  useEffect(() => {
    let active = true;
    fetch(CONFIG_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (active && c) setConfig(c as PublicConfig);
      })
      .catch(() => {
        /* config is optional; form still works without captcha */
      });
    return () => {
      active = false;
    };
  }, []);

  const recaptchaEnabled = Boolean(config?.recaptchaEnabled && config?.recaptchaSiteKey);
  const scriptReady = useRecaptchaScript(
    recaptchaEnabled,
    config?.recaptchaSiteKey ?? "",
    config?.recaptchaVersion ?? "v2",
  );

  // Render the v2 checkbox widget once the script is ready.
  useEffect(() => {
    if (
      !recaptchaEnabled ||
      config?.recaptchaVersion !== "v2" ||
      !scriptReady ||
      !v2Container.current ||
      v2WidgetId.current !== null ||
      !window.grecaptcha?.render
    ) {
      return;
    }
    v2WidgetId.current = window.grecaptcha.render(v2Container.current, {
      sitekey: config.recaptchaSiteKey,
    });
  }, [recaptchaEnabled, scriptReady, config]);

  async function resolveToken(): Promise<string | undefined> {
    if (!recaptchaEnabled || !config) return undefined;
    if (config.recaptchaVersion === "v3") {
      if (!window.grecaptcha) return undefined;
      return new Promise<string>((resolve) => {
        window.grecaptcha!.ready(async () => {
          const token = await window.grecaptcha!.execute(config.recaptchaSiteKey, {
            action: "submit",
          });
          resolve(token);
        });
      });
    }
    // v2 checkbox
    return window.grecaptcha?.getResponse?.(v2WidgetId.current ?? undefined);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const formData = new FormData(e.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(formData);

    // Attach control metadata for the server pipeline.
    data._np_ts = renderedAt;
    data._fields = attributes.fields;

    const token = await resolveToken();
    if (recaptchaEnabled && !token) {
      setStatus("error");
      setMessage("Please complete the reCAPTCHA challenge.");
      return;
    }
    if (token) data._recaptcha_token = token;

    try {
      const res = await fetch(SUBMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setStatus("sent");
        setMessage(result.message ?? attributes.successMessage);
        formRef.current?.reset();
      } else {
        setStatus("error");
        setMessage(result.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    } finally {
      // Reset v2 so the user can retry.
      if (config?.recaptchaVersion === "v2" && window.grecaptcha?.reset) {
        window.grecaptcha.reset(v2WidgetId.current ?? undefined);
      }
    }
  }

  if (status === "sent") {
    return (
      <div className="np-form-success p-4 bg-green-50 text-green-700 rounded-sm">
        {message}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="np-form-generator space-y-4"
      noValidate
    >
      {attributes.formTitle && (
        <h3 className="text-lg font-semibold">{attributes.formTitle}</h3>
      )}
      {attributes.formDescription && (
        <p className="text-sm text-gray-600">{attributes.formDescription}</p>
      )}

      {attributes.fields.map((field) => (
        <div key={field.name} className="np-form-field">
          <label htmlFor={field.name} className="block text-sm font-medium mb-1">
            {field.label}
            {field.required && <span className="text-red-500"> *</span>}
          </label>
          <FieldControl field={field} />
          {field.helpText && (
            <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>
          )}
        </div>
      ))}

      {/* Honeypot — visually hidden, ignored by humans, filled by bots. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label htmlFor={honeypotName}>Leave this field empty</label>
        <input
          type="text"
          id={honeypotName}
          name={honeypotName}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {recaptchaEnabled && config?.recaptchaVersion === "v2" && (
        <div ref={v2Container} className="np-recaptcha" />
      )}

      {status === "error" && (
        <p className="np-form-error text-red-500 text-sm">{message}</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="np-btn np-btn-primary np-btn-md"
      >
        {status === "sending" ? "Sending…" : attributes.submitLabel}
      </button>
    </form>
  );
}

function FieldControl({
  field,
}: {
  field: FormGeneratorAttributes["fields"][number];
}) {
  const common = {
    id: field.name,
    name: field.name,
    required: field.required,
    placeholder: field.placeholder,
    className: "np-input w-full",
  };

  switch (field.type) {
    case "textarea":
      return <textarea {...common} rows={4} />;
    case "select":
      return (
        <select {...common}>
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "radio":
      return (
        <div className="space-y-1">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={field.name}
                value={o.value}
                required={field.required}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    case "checkbox":
      return (
        <input
          type="checkbox"
          id={field.name}
          name={field.name}
          required={field.required}
          className="np-checkbox"
        />
      );
    case "number":
      return <input {...common} type="number" />;
    case "tel":
      return <input {...common} type="tel" />;
    case "url":
      return <input {...common} type="url" />;
    case "date":
      return <input {...common} type="date" />;
    case "email":
      return <input {...common} type="email" />;
    case "text":
    default:
      return <input {...common} type="text" />;
  }
}
