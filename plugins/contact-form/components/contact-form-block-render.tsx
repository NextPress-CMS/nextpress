"use client";

import { useState } from "react";
import type { BlockRenderProps } from "@nextpress/blocks";
import { z } from "zod";

type ContactFormAttributes = z.infer<typeof import("../index").contactFormSchema>;

export default function ContactFormBlock({ attributes }: BlockRenderProps<ContactFormAttributes>) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);

    try {
      const res = await fetch("/api/v1/plugins/contact-form/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok) {
        setStatus("sent");
        setMessage(result.message);
      } else {
        setStatus("error");
        setMessage(result.error ?? "Something went wrong");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  if (status === "sent") {
    return <div className="np-contact-form-success p-4 bg-green-50 text-green-700 rounded-sm">{message}</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="np-contact-form space-y-4">
      {attributes.formTitle && <h3 className="text-lg font-semibold">{attributes.formTitle}</h3>}
      {attributes.fields.map((field) => (
        <div key={field.name}>
          <label className="block text-sm font-medium mb-1">{field.label}</label>
          {field.type === "textarea" ? (
            <textarea name={field.name} required={field.required} rows={4} className="np-input w-full" placeholder={field.placeholder} />
          ) : (
            <input type={field.type} name={field.name} required={field.required} className="np-input w-full" placeholder={field.placeholder} />
          )}
        </div>
      ))}
      {status === "error" && <p className="text-red-500 text-sm">{message}</p>}
      <button type="submit" disabled={status === "sending"} className="np-btn np-btn-primary np-btn-md">
        {status === "sending" ? "Sending..." : attributes.submitLabel}
      </button>
    </form>
  );
}
