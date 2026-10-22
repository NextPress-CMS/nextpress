"use client";

/**
 * Instagram admin dashboard.
 *
 * Presentation only. Every action posts to a permission-gated server route;
 * hiding a button is never the security boundary. The token is not fetched,
 * not rendered, and not present in any payload this component receives — the
 * server sends a `PublicConnection`, which has no secret fields.
 *
 * UX principles applied here:
 *   - Skeletons instead of a bare "Loading…" line, so layout does not jump.
 *   - The connection state decides the whole screen: an admin should never
 *     have to hunt for why sync is not running.
 *   - Destructive actions use the design system's dialog, not window.confirm.
 *   - Results are announced through toasts rather than inline text that
 *     pushes the page around.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Images,
  Instagram,
  KeyRound,
  Link2Off,
  RefreshCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import { Button, ConfirmDialog, PageHeader, useToast } from "@nextpress/ui";
import type { PublicConnection } from "../schemas/settings";
import { InstagramNav } from "./instagram-nav";

interface DashboardData {
  connection: PublicConnection;
  stats: {
    imported: number;
    pending: number;
    failed: number;
    published: number;
    publishFailed: number;
  };
}

const TOKEN_STATUS: Record<
  PublicConnection["tokenStatus"],
  { label: string; tone: string; icon: typeof CheckCircle2 }
> = {
  valid: { label: "Valid", tone: "text-emerald-600", icon: CheckCircle2 },
  expiring_soon: { label: "Expiring soon", tone: "text-amber-600", icon: Clock },
  expired: { label: "Expired", tone: "text-red-600", icon: TriangleAlert },
  unknown: { label: "Unknown", tone: "text-gray-500", icon: KeyRound },
};

const CONNECT_URL = "/api/v1/plugins/instagram-post/oauth/start";

export default function InstagramDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/plugins/instagram-post/dashboard");
      if (!response.ok) throw new Error("load failed");
      setData(await response.json());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const syncNow = useCallback(async () => {
    setBusy("sync");
    try {
      const response = await fetch("/api/v1/plugins/instagram-post/sync", { method: "POST" });
      const result = await response.json();

      if (response.ok) {
        // Report the real outcome. "Synced 0" is useful information, not a
        // failure, and saying so avoids a pointless second click.
        toast(
          "success",
          result.imported > 0
            ? `Imported ${result.imported} new post${result.imported === 1 ? "" : "s"}.`
            : "Already up to date. No new posts found.",
        );
      } else {
        toast("error", result.error ?? "Synchronisation failed.");
      }
      await load();
    } catch {
      toast("error", "Synchronisation could not be started.");
    } finally {
      setBusy(null);
    }
  }, [load, toast]);

  const disconnect = useCallback(async () => {
    setBusy("disconnect");
    try {
      await fetch("/api/v1/plugins/instagram-post/connection", { method: "DELETE" });
      toast("info", "Instagram disconnected. Archived posts were kept.");
      await load();
    } finally {
      setBusy(null);
      setConfirmDisconnect(false);
    }
  }, [load, toast]);

  if (loadFailed) {
    return (
      <>
        <PageHeader title="Instagram" description="Archive and publishing for your connected account." />
        <InstagramNav />
        <Callout tone="danger" icon={AlertTriangle} title="Instagram status could not be loaded.">
          <p>Refresh the page. If this continues, check the server logs for plugin errors.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </Callout>
      </>
    );
  }

  if (!data) return <DashboardSkeleton />;

  const { connection, stats } = data;

  // ── Not connected: a single, unambiguous call to action ──
  if (connection.status === "not_connected") {
    return (
      <>
        <PageHeader title="Instagram" description="Archive and publishing for your connected account." />
        <InstagramNav />

        <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-fuchsia-500 via-rose-500 to-amber-400">
            <Instagram className="h-7 w-7 text-white" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-gray-900">Connect an Instagram account</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500">
            Archive your posts onto this website and publish new content straight from the editor.
            Requires a professional (Business or Creator) account.
          </p>
          <a
            href={CONNECT_URL}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-indigo-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-1"
          >
            <Instagram className="h-4 w-4" />
            Connect Instagram
          </a>
        </div>
      </>
    );
  }

  const needsReauth = connection.status === "needs_reauth";
  const token = TOKEN_STATUS[connection.tokenStatus];

  return (
    <>
      <PageHeader
        title="Instagram"
        description="Archive and publishing for your connected account."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void syncNow()}
              loading={busy === "sync"}
              disabled={busy !== null || needsReauth}
            >
              {busy !== "sync" && <RefreshCw className="h-4 w-4" />}
              Sync now
            </Button>
            <a
              href="/admin/plugins/instagram-post/import"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-indigo-700"
            >
              <Download className="h-4 w-4" />
              Import posts
            </a>
          </>
        }
      />

      <InstagramNav />

      {needsReauth && (
        <Callout
          tone="warning"
          icon={TriangleAlert}
          title="Instagram connection requires attention"
          className="mb-6"
        >
          <p>
            {connection.lastSyncError ??
              "Your Instagram authorisation may have expired. Synchronisation and publishing are paused until the account is reconnected."}
          </p>
          <a
            href={CONNECT_URL}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reconnect Instagram
          </a>
        </Callout>
      )}

      {/* ── Account card ── */}
      <section className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-fuchsia-500 via-rose-500 to-amber-400">
            <Instagram className="h-6 w-6 text-white" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-gray-900">
                @{connection.username}
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  needsReauth
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    needsReauth ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
                {needsReauth ? "Needs attention" : "Connected"}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm text-gray-500">
              {connection.accountType ?? "Professional"} account
              {connection.accountId ? ` · ID ${connection.accountId}` : ""}
            </p>
          </div>

          <a
            href={`https://instagram.com/${connection.username ?? ""}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
          >
            View profile
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <dl className="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Detail label="Token status">
            <span className={`inline-flex items-center gap-1.5 font-medium ${token.tone}`}>
              <token.icon className="h-4 w-4" />
              {token.label}
            </span>
          </Detail>
          <Detail label="Connected">{formatDate(connection.connectedAt)}</Detail>
          <Detail label="Last sync">{formatRelative(connection.lastSyncAt)}</Detail>
        </dl>
      </section>

      {/* ── Counters ── */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Archived" value={stats.imported} icon={Images} tone="indigo" />
        <Stat label="Pending" value={stats.pending} icon={Clock} tone="gray" />
        <Stat label="Published to Instagram" value={stats.published} icon={Send} tone="emerald" />
        <Stat
          label="Failed"
          value={stats.failed + stats.publishFailed}
          icon={TriangleAlert}
          tone={stats.failed + stats.publishFailed > 0 ? "red" : "gray"}
          href={
            stats.failed + stats.publishFailed > 0
              ? "/admin/plugins/instagram-post/posts"
              : undefined
          }
        />
      </div>

      {/* ── Danger zone ── */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-6 py-5 shadow-xs">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Disconnect Instagram</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Stops synchronisation and publishing. Your archived posts stay on this website.
          </p>
        </div>
        <Button
          variant="outline"
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => setConfirmDisconnect(true)}
          disabled={busy !== null}
        >
          <Link2Off className="h-4 w-4" />
          Disconnect
        </Button>
      </section>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Instagram?"
        description="Synchronisation and Instagram publishing will stop. Existing archived posts will remain on this website and are not deleted."
        confirmLabel="Disconnect"
        variant="danger"
        onConfirm={disconnect}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </>
  );
}

// ── Presentational helpers ──

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

const STAT_TONES = {
  indigo: "bg-indigo-50 text-indigo-600",
  emerald: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-600",
  gray: "bg-gray-100 text-gray-500",
} as const;

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: number;
  icon: typeof Images;
  tone: keyof typeof STAT_TONES;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-gray-900">{value}</p>
    </>
  );

  // Only linkable when there is somewhere useful to go, so a zero count does
  // not present a dead affordance.
  return href ? (
    <a
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs transition-all hover:border-gray-300 hover:shadow-md"
    >
      {body}
    </a>
  ) : (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">{body}</div>
  );
}

const CALLOUT_TONES = {
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
} as const;

function Callout({
  tone,
  icon: Icon,
  title,
  children,
  className = "",
}: {
  tone: keyof typeof CALLOUT_TONES;
  icon: typeof AlertTriangle;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border p-5 ${CALLOUT_TONES[tone]} ${className}`} role="alert">
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 text-sm">
          <h3 className="font-semibold">{title}</h3>
          <div className="mt-1 leading-relaxed opacity-90">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Matches the real layout, so nothing shifts when data lands. */
function DashboardSkeleton() {
  return (
    <>
      <PageHeader title="Instagram" description="Archive and publishing for your connected account." />
      <InstagramNav />

      <div className="mb-6 animate-pulse rounded-xl border border-gray-200 bg-white shadow-xs">
        <div className="flex items-center gap-4 border-b border-gray-100 px-6 py-5">
          <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded-sm bg-gray-200" />
            <div className="h-3 w-56 rounded-sm bg-gray-100" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 px-6 py-4">
              <div className="h-3 w-20 rounded-sm bg-gray-100" />
              <div className="h-4 w-28 rounded-sm bg-gray-200" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
            <div className="h-3 w-20 rounded-sm bg-gray-100" />
            <div className="mt-3 h-8 w-12 rounded-sm bg-gray-200" />
          </div>
        ))}
      </div>
    </>
  );
}

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Relative time for the last sync.
 *
 * "12 minutes ago" answers the real question (is sync alive?) far faster than
 * a timestamp the reader has to compare against the clock themselves.
 */
function formatRelative(value: string | undefined): string {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
