"use client";

import type { BlockEditProps } from "@nextpress/blocks";

export default function ContactFormEdit({ attributes, setAttributes, isSelected }: BlockEditProps) {
  return (
    <div className="np-contact-form-edit border-2 border-dashed border-gray-300 rounded-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">📧</span>
        <span className="font-medium">Contact Form</span>
      </div>
      {isSelected ? (
        <div className="space-y-2">
          <input type="text" value={(attributes as any).formTitle ?? ""} onChange={(e) => setAttributes({ formTitle: e.target.value })}
            className="np-input w-full" placeholder="Form title" />
          <input type="text" value={(attributes as any).submitLabel ?? ""} onChange={(e) => setAttributes({ submitLabel: e.target.value })}
            className="np-input w-full" placeholder="Submit button text" />
          <p className="text-xs text-gray-400">{((attributes as any).fields ?? []).length} fields configured</p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">{(attributes as any).formTitle ?? "Contact Form"} — {((attributes as any).fields ?? []).length} fields</p>
      )}
    </div>
  );
}
