"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { uploadSkin } from "./actions";
import { trpc } from "@/lib/trpc/client";

export function UploadThemeForm() {
  const utils = trpc.useUtils();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "success"; message: string }
    | { type: "error"; message: string }
  >({ type: "idle" });

  function handleSubmit(formData: FormData) {
    setStatus({ type: "idle" });
    startTransition(async () => {
      const result = await uploadSkin(formData);
      if (result.error) {
        setStatus({ type: "error", message: result.error });
        return;
      }
      if (result.success) {
        setStatus({
          type: "success",
          message: `Installed "${result.success.name}". Activate it below.`,
        });
        formRef.current?.reset();
        utils.theme.list.invalidate();
      }
    });
  }

  return (
    <div className="bg-white rounded-lg border p-5 mb-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Upload className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Install theme from zip</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload a .zip containing theme.json and styles/theme.css. The theme becomes available
            to activate without a rebuild.
          </p>
        </div>
      </div>

      <form ref={formRef} action={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="file"
          name="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          required
          className="flex-1 text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
        />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          {isPending ? "Installing…" : "Install"}
        </button>
      </form>

      {status.type === "error" && (
        <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{status.message}</span>
        </div>
      )}
      {status.type === "success" && (
        <div className="mt-3 flex items-start gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{status.message}</span>
        </div>
      )}
    </div>
  );
}
