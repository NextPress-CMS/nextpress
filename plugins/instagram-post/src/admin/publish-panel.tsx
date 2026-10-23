"use client";

/**
 * Editor sidebar panel — Instagram publishing.
 *
 * Mounted into the EXISTING NextPress editor rather than shipping a second
 * editor. It carries no business logic: it renders state and posts intent to
 * the server, where permissions and validation are actually enforced.
 *
 * A website article and an Instagram post are different artefacts, so the
 * Instagram caption is a separate field rather than a reuse of the body copy.
 */

import { useCallback, useEffect, useState } from "react";
import { CAPTION_MAX_LENGTH } from "../services/media-validation";
import type { PublishState } from "../services/sync-state";

interface PublishPanelProps {
  entryId: string;
  /** NextPress lifecycle status — Instagram publishing requires PUBLISHED. */
  entryStatus: string;
}

interface PanelState {
  enabled: boolean;
  caption: string;
  publishStatus: PublishState;
  instagramMediaId?: string;
  permalink?: string;
  error?: string;
  retryCount: number;
  connected: boolean;
  connectionMessage?: string;
}

const STATUS_LABELS: Record<PublishState, string> = {
  NOT_PUBLISHED: "Not published",
  PUBLISH_PENDING: "Queued",
  PUBLISHING: "Publishing…",
  PUBLISHED: "Published to Instagram",
  PUBLISH_FAILED: "Publication failed",
  RETRY_PENDING: "Retrying automatically",
};

export default function InstagramPublishPanel({ entryId, entryStatus }: PublishPanelProps) {
  const [state, setState] = useState<PanelState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/v1/plugins/instagram-post/entries/${entryId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data: PanelState) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            enabled: false,
            caption: "",
            publishStatus: "NOT_PUBLISHED",
            retryCount: 0,
            connected: false,
            connectionMessage: "Instagram status could not be loaded.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const save = useCallback(
    async (patch: Partial<Pick<PanelState, "enabled" | "caption">>) => {
      setSaving(true);
      try {
        const response = await fetch(`/api/v1/plugins/instagram-post/entries/${entryId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (response.ok) {
          const data: PanelState = await response.json();
          setState(data);
        }
      } finally {
        setSaving(false);
      }
    },
    [entryId],
  );

  const publishNow = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/plugins/instagram-post/entries/${entryId}/publish`,
        { method: "POST" },
      );
      const data: PanelState = await response.json();
      setState(data);
    } finally {
      setBusy(false);
    }
  }, [entryId]);

  if (!state) return <p className="np-panel-loading">Loading Instagram status…</p>;

  if (!state.connected) {
    return (
      <div className="np-panel">
        <p>{state.connectionMessage ?? "No Instagram account is connected to this site."}</p>
        <a href="/admin/plugins/instagram-post">Connect Instagram</a>
      </div>
    );
  }

  const isPublished = state.publishStatus === "PUBLISHED";
  const captionLength = state.caption.length;

  return (
    <div className="np-panel">
      <label className="np-field np-field--checkbox">
        <input
          type="checkbox"
          checked={state.enabled}
          disabled={saving || isPublished}
          onChange={(e) => void save({ enabled: e.target.checked })}
        />
        <span>Publish to Instagram</span>
      </label>

      {state.enabled && (
        <>
          <label className="np-field">
            <span>Instagram caption</span>
            <textarea
              rows={5}
              value={state.caption}
              maxLength={CAPTION_MAX_LENGTH}
              disabled={saving || isPublished}
              placeholder="Caption used on Instagram. Hashtags and mentions are preserved."
              onChange={(e) => setState({ ...state, caption: e.target.value })}
              onBlur={(e) => void save({ caption: e.target.value })}
            />
            <small>
              {captionLength} / {CAPTION_MAX_LENGTH}
            </small>
          </label>

          <p className="np-field">
            <span>Status</span>
            <strong>{STATUS_LABELS[state.publishStatus]}</strong>
          </p>

          {state.error && (
            <div className="np-notice np-notice--error">
              <p>{state.error}</p>
              {state.retryCount > 0 && <p>Retry {state.retryCount} of 5.</p>}
            </div>
          )}

          {isPublished && state.permalink && (
            <p>
              <a href={state.permalink} target="_blank" rel="noreferrer noopener">
                View on Instagram
              </a>
            </p>
          )}

          {/* Publishing a draft is refused server-side; the UI says why up front. */}
          {!isPublished && (
            <button
              type="button"
              disabled={busy || entryStatus !== "PUBLISHED"}
              onClick={() => void publishNow()}
            >
              {busy ? "Publishing…" : "Publish to Instagram"}
            </button>
          )}

          {entryStatus !== "PUBLISHED" && !isPublished && (
            <small>This entry will be published to Instagram once it goes live on the website.</small>
          )}
        </>
      )}
    </div>
  );
}
