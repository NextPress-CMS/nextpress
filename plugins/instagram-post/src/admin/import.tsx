"use client";

/**
 * Historical import screen: preview, then import.
 *
 * The preview exists because importing an entire account is a large, slow
 * operation and an admin deserves to know the shape of it first: how many
 * posts exist, how many are already archived, how many are genuinely new.
 *
 * Import runs SERVER-SIDE in resumable batches. Closing this tab does not
 * cancel it, and re-running is safe: imports are keyed on the Instagram media
 * id, so a second run creates no duplicates.
 */

import { useCallback, useState } from "react";
import { CheckCircle2, Download, Eye, Loader2, TriangleAlert } from "lucide-react";
import { Button, PageHeader } from "@nextpress/ui";
import { InstagramNav } from "./instagram-nav";

type ImportSize = "10" | "25" | "50" | "100" | "all";

interface PreviewItem {
  mediaId: string;
  caption?: string;
  mediaType: string;
  timestamp: string;
  thumbnailUrl?: string;
  alreadyImported: boolean;
}

interface PreviewResult {
  discovered: number;
  alreadyArchived: number;
  newPosts: number;
  items: PreviewItem[];
}

interface ImportProgress {
  processed: number;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  done: boolean;
  cursor: string | null;
  message?: string;
}

const SIZE_OPTIONS: Array<{ value: ImportSize; label: string }> = [
  { value: "10", label: "Latest 10" },
  { value: "25", label: "Latest 25" },
  { value: "50", label: "Latest 50" },
  { value: "100", label: "Latest 100" },
  { value: "all", label: "All available" },
];

export default function InstagramImport() {
  const [size, setSize] = useState<ImportSize>("25");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = useCallback(async () => {
    setBusy("preview");
    setError(null);
    setProgress(null);
    try {
      const response = await fetch("/api/v1/plugins/instagram-post/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: size === "all" ? null : Number(size) }),
      });
      const data = await response.json();
      if (response.ok) setPreview(data);
      else setError(data.error ?? "Preview failed.");
    } catch {
      setError("Preview could not be completed.");
    } finally {
      setBusy(null);
    }
  }, [size]);

  /**
   * Drive the import in batches, each a separate request.
   *
   * Batching keeps every request short (no gateway timeouts on a large
   * account) and gives honest progress. The server returns a cursor; the next
   * batch resumes from it, so an interrupted import loses at most one batch.
   */
  const runImport = useCallback(async () => {
    setBusy("import");
    setError(null);

    const total = preview?.newPosts ?? 0;
    let cursor: string | null = null;
    let aggregate: ImportProgress = {
      processed: 0,
      total,
      imported: 0,
      skipped: 0,
      failed: 0,
      done: false,
      cursor: null,
    };
    setProgress(aggregate);

    try {
      for (;;) {
        const response: Response = await fetch("/api/v1/plugins/instagram-post/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 10, cursor }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Import failed.");
          break;
        }

        aggregate = {
          processed: aggregate.processed + (data.discovered ?? 0),
          total: Math.max(total, aggregate.processed + (data.discovered ?? 0)),
          imported: aggregate.imported + (data.imported ?? 0),
          skipped: aggregate.skipped + (data.skipped ?? 0),
          failed: aggregate.failed + (data.failed ?? 0),
          done: !data.nextCursor,
          cursor: data.nextCursor ?? null,
          message: data.abortReason,
        };
        setProgress(aggregate);

        if (!data.nextCursor) break;
        cursor = data.nextCursor;
      }
    } catch {
      setError(
        "The import was interrupted. It can be resumed safely; no duplicates are created.",
      );
    } finally {
      setBusy(null);
    }
  }, [preview]);

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;

  return (
    <>
      <PageHeader
        title="Import from Instagram"
        description="Bring your existing Instagram posts into this website's archive."
      />
      <InstagramNav />

      {/* ── Step 1: choose a size ── */}
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
        <h2 className="text-sm font-semibold text-gray-900">How many posts?</h2>
        <p className="mt-1 text-sm text-gray-500">
          Start with a preview. Nothing is written until you confirm.
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Import size">
          {SIZE_OPTIONS.map((option) => {
            const active = size === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSize(option.value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  active
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <Button
          className="mt-5"
          variant="outline"
          onClick={() => void runPreview()}
          loading={busy === "preview"}
          disabled={busy !== null}
        >
          {busy !== "preview" && <Eye className="h-4 w-4" />}
          Preview
        </Button>
      </section>

      {error && (
        <div
          role="alert"
          className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* ── Step 2: review the preview ── */}
      {preview && !progress && (
        <section className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
            <Figure label="Discovered" value={preview.discovered} />
            <Figure label="Already archived" value={preview.alreadyArchived} muted />
            <Figure label="New" value={preview.newPosts} accent />
          </div>

          {preview.items.length > 0 && (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {preview.items.slice(0, 50).map((item) => (
                <li key={item.mediaId} className="flex items-center gap-3 px-6 py-3">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      width={44}
                      height={44}
                      loading="lazy"
                      className="h-11 w-11 shrink-0 rounded-md bg-gray-100 object-cover"
                    />
                  ) : (
                    <div className="h-11 w-11 shrink-0 rounded-md bg-gray-100" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-900">
                      {item.caption?.trim() || (
                        <span className="italic text-gray-400">No caption</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {new Date(item.timestamp).toLocaleDateString()} · {item.mediaType}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.alreadyImported
                        ? "bg-gray-100 text-gray-500"
                        : "bg-indigo-50 text-indigo-700"
                    }`}
                  >
                    {item.alreadyImported ? "Archived" : "New"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
            <p className="text-sm text-gray-500">
              {preview.newPosts === 0
                ? "Everything discovered is already archived."
                : `${preview.newPosts} post${preview.newPosts === 1 ? "" : "s"} will be imported.`}
            </p>
            <Button
              onClick={() => void runImport()}
              disabled={busy !== null || preview.newPosts === 0}
            >
              <Download className="h-4 w-4" />
              Import {preview.newPosts} post{preview.newPosts === 1 ? "" : "s"}
            </Button>
          </div>
        </section>
      )}

      {/* ── Step 3: progress ── */}
      {progress && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-3">
            {progress.done ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            )}
            <h2 className="text-sm font-semibold text-gray-900">
              {progress.done ? "Import complete" : "Importing Instagram posts…"}
            </h2>
            <span className="ml-auto text-sm tabular-nums text-gray-500">
              {progress.processed} / {progress.total || progress.processed}
            </span>
          </div>

          <div
            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                progress.done ? "bg-emerald-500" : "bg-indigo-600"
              }`}
              style={{ width: `${Math.max(percent, 2)}%` }}
            />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4">
            <Figure label="Imported" value={progress.imported} accent />
            <Figure label="Skipped" value={progress.skipped} muted />
            <Figure label="Failed" value={progress.failed} danger={progress.failed > 0} />
          </div>

          {progress.message && (
            <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {progress.message}
            </p>
          )}

          {!progress.done && (
            <p className="mt-4 text-xs leading-relaxed text-gray-500">
              This import continues on the server. You can safely close this page; running it
              again will not create duplicates.
            </p>
          )}

          {progress.done && (
            <a
              href="/admin/plugins/instagram-post/posts"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700"
            >
              View archived posts →
            </a>
          )}
        </section>
      )}
    </>
  );
}

function Figure({
  label,
  value,
  accent,
  muted,
  danger,
}: {
  label: string;
  value: number;
  accent?: boolean;
  muted?: boolean;
  danger?: boolean;
}) {
  const tone = danger
    ? "text-red-600"
    : accent
      ? "text-indigo-600"
      : muted
        ? "text-gray-400"
        : "text-gray-900";

  return (
    <div className="px-6 py-4 first:pl-6">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
