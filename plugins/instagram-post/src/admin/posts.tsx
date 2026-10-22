"use client";

/**
 * Archived posts management screen.
 *
 * Makes provenance unambiguous (imported from Instagram, created here, or
 * published out to Instagram) because a post's origin decides what actions
 * are legitimate on it.
 *
 * Only safe actions are offered. There is deliberately no bulk delete: an
 * archive's value is that it does not evaporate on a mis-click.
 */

import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, Pencil, RefreshCw } from "lucide-react";
import { Button, PageHeader } from "@nextpress/ui";
import { InstagramNav } from "./instagram-nav";

type SourceLabel = "Instagram" | "Website";
type SyncLabel = "Synced" | "Pending" | "Failed" | "Retrying";

interface ArchivedPostRow {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl?: string;
  source: SourceLabel;
  syncStatus: SyncLabel;
  mediaType?: string;
  instagramPermalink?: string;
  publishedAt?: string;
  lastSyncedAt?: string;
  error?: string;
}

const STATUS_STYLES: Record<SyncLabel, string> = {
  Synced: "bg-emerald-50 text-emerald-700",
  Pending: "bg-amber-50 text-amber-700",
  Retrying: "bg-amber-50 text-amber-700",
  Failed: "bg-red-50 text-red-700",
};

export default function InstagramPostsPage() {
  const [rows, setRows] = useState<ArchivedPostRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/plugins/instagram-post/posts");
    if (response.ok) setRows((await response.json()).items ?? []);
    else setRows([]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await fetch(`/api/v1/plugins/instagram-post/posts/${id}/resync`, { method: "POST" });
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const header = (
    <PageHeader
      title="Archived posts"
      description="Instagram posts stored on this website."
      actions={
        <a
          href="/admin/plugins/instagram-post/import"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          <Download className="h-4 w-4" />
          Import posts
        </a>
      }
    />
  );

  if (!rows) {
    return (
      <>
        {header}
        <InstagramNav />
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex animate-pulse items-center gap-4 border-b border-gray-100 px-6 py-4 last:border-0">
              <div className="h-11 w-11 shrink-0 rounded-md bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/3 rounded bg-gray-200" />
                <div className="h-3 w-1/4 rounded bg-gray-100" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <>
        {header}
        <InstagramNav />
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">No archived posts yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
            Import your Instagram history to build a permanent archive on this website.
          </p>
          <a
            href="/admin/plugins/instagram-post/import"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            <Download className="h-4 w-4" />
            Import posts
          </a>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <InstagramNav />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th scope="col" className="px-6 py-3 font-medium text-gray-500">Post</th>
                <th scope="col" className="px-4 py-3 font-medium text-gray-500">Source</th>
                <th scope="col" className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th scope="col" className="px-4 py-3 font-medium text-gray-500">Type</th>
                <th scope="col" className="px-4 py-3 font-medium text-gray-500">Published</th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-gray-50/70">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      {row.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.thumbnailUrl}
                          alt=""
                          width={44}
                          height={44}
                          loading="lazy"
                          className="h-11 w-11 shrink-0 rounded-md bg-gray-100 object-cover"
                        />
                      ) : (
                        <div className="h-11 w-11 shrink-0 rounded-md bg-gray-100" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{row.title}</p>
                        {row.error && (
                          <p className="mt-0.5 truncate text-xs text-red-600" title={row.error}>
                            {row.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.source === "Instagram"
                          ? "bg-fuchsia-50 text-fuchsia-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {row.source}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.syncStatus]}`}
                    >
                      {row.syncStatus}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-gray-500">{row.mediaType ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {formatDate(row.publishedAt)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {(row.syncStatus === "Failed" || row.syncStatus === "Retrying") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void retry(row.id)}
                          loading={busyId === row.id}
                          disabled={busyId !== null}
                        >
                          {busyId !== row.id && <RefreshCw className="h-3.5 w-3.5" />}
                          Retry
                        </Button>
                      )}
                      <IconLink
                        href={`/admin/content/instagram-post/${row.id}`}
                        label="Edit post"
                        icon={Pencil}
                      />
                      {row.instagramPermalink && (
                        <IconLink
                          href={row.instagramPermalink}
                          label="Open on Instagram"
                          icon={ExternalLink}
                          external
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function IconLink({
  href,
  label,
  icon: Icon,
  external,
}: {
  href: string;
  label: string;
  icon: typeof Pencil;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
