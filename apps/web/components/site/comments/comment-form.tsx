"use client";

import { useState } from "react";
import { Button } from "@nextpress/ui";

interface Props {
  contentEntryId: string;
  parentId?: string;
  isAuthenticated: boolean;
  onSuccess?: () => void;
}

/**
 * Client component: comment submission form.
 * Supports both authenticated and guest submissions.
 */
export function CommentForm({
  contentEntryId,
  parentId,
  isAuthenticated,
  onSuccess,
}: Props) {
  const [body, setBody] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestUrl, setGuestUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");

    try {
      const res = await fetch("/api/v1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentEntryId,
          parentId: parentId ?? null,
          body,
          ...(!isAuthenticated && {
            guestName,
            guestEmail,
            guestUrl: guestUrl || undefined,
          }),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error?.message ?? "Failed to submit comment");
        setStatus("error");
        return;
      }

      setStatus("sent");
      setBody("");
      onSuccess?.();
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-sm bg-green-50 border border-green-200 p-4 text-sm text-green-700">
        Thank you! Your comment has been submitted
        {isAuthenticated ? "." : " and is awaiting moderation."}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Guest fields */}
      {!isAuthenticated && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="np-input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="np-input w-full"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Website</label>
            <input
              type="url"
              value={guestUrl}
              onChange={(e) => setGuestUrl(e.target.value)}
              placeholder="https://"
              className="np-input w-full"
            />
          </div>
        </div>
      )}

      {/* Comment body */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Comment <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="np-input w-full"
          placeholder="Write a comment..."
          maxLength={10_000}
        />
        <p className="text-xs text-gray-400 mt-1">
          Basic formatting allowed: bold, italic, links, code.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={status === "sending"}
        disabled={!body.trim()}
      >
        {parentId ? "Reply" : "Post Comment"}
      </Button>
    </form>
  );
}
