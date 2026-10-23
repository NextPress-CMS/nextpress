"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useToast, Badge, Button, ConfirmDialog } from "@nextpress/ui";
import type { CommentListDto, CommentStatusInput } from "@nextpress/core/comment/comment-types";

interface Props {
  initialData: {
    items: CommentListDto[];
    total: number;
    page: number;
    totalPages: number;
  };
  currentStatus?: string;
  counts: Record<CommentStatusInput, number>;
}

export function CommentList({ initialData, currentStatus, counts }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const moderateMutation = trpc.comment.moderate.useMutation({
    onSuccess: () => { utils.comment.list.invalidate(); toast("success", "Updated"); },
    onError: (e) => toast("error", e.message),
  });
  const bulkMutation = trpc.comment.moderateBulk.useMutation({
    onSuccess: (data) => { utils.comment.list.invalidate(); toast("success", `${data.updated} comments updated`); setSelected(new Set()); },
  });
  const deleteMutation = trpc.comment.delete.useMutation({
    onSuccess: () => { utils.comment.list.invalidate(); toast("success", "Deleted"); setDeleteId(null); },
  });

  function toggleSelect(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  const statusTabs: Array<{ value: string; label: string; count: number }> = [
    { value: "", label: "All", count: Object.values(counts).reduce((a, b) => a + b, 0) },
    { value: "PENDING", label: "Pending", count: counts.PENDING },
    { value: "APPROVED", label: "Approved", count: counts.APPROVED },
    { value: "SPAM", label: "Spam", count: counts.SPAM },
    { value: "TRASH", label: "Trash", count: counts.TRASH },
  ];

  return (
    <div>
      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => router.push(`/admin/comments${tab.value ? `?status=${tab.value}` : ""}`)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              (currentStatus ?? "") === tab.value
                ? "border-blue-600 text-blue-600 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 rounded-sm text-sm">
          <span>{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ ids: Array.from(selected), status: "APPROVED" })}>
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ ids: Array.from(selected), status: "SPAM" })}>
            Spam
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ ids: Array.from(selected), status: "TRASH" })}>
            Trash
          </Button>
        </div>
      )}

      {/* Comment list */}
      <div className="bg-white rounded-lg border divide-y">
        {initialData.items.map((comment) => (
          <div key={comment.id} className="p-4 hover:bg-gray-50">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(comment.id)}
                onChange={() => toggleSelect(comment.id)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{comment.author.name}</span>
                  {comment.author.type === "guest" && comment.author.email && (
                    <span className="text-xs text-gray-400">{comment.author.email}</span>
                  )}
                  <Badge variant={
                    comment.status === "APPROVED" ? "success" :
                    comment.status === "SPAM" ? "danger" :
                    comment.status === "TRASH" ? "default" : "warning"
                  }>
                    {comment.status.toLowerCase()}
                  </Badge>
                </div>
                <p className="text-sm text-gray-700 mb-2 line-clamp-3">{comment.body.replace(/<[^>]*>/g, "")}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>on <a href={`/admin/posts/${comment.contentEntryId}/edit`} className="text-blue-600 hover:underline">{comment.contentEntryTitle}</a></span>
                  <span>{new Date(comment.createdAt).toLocaleString()}</span>
                  {comment.replyCount > 0 && <span>{comment.replyCount} replies</span>}
                </div>
                {/* Quick actions */}
                <div className="flex gap-2 mt-2">
                  {comment.status !== "APPROVED" && (
                    <button onClick={() => moderateMutation.mutate({ id: comment.id, status: "APPROVED" })} className="text-xs text-green-600 hover:underline">Approve</button>
                  )}
                  {comment.status !== "SPAM" && (
                    <button onClick={() => moderateMutation.mutate({ id: comment.id, status: "SPAM" })} className="text-xs text-amber-600 hover:underline">Spam</button>
                  )}
                  {comment.status !== "TRASH" && (
                    <button onClick={() => moderateMutation.mutate({ id: comment.id, status: "TRASH" })} className="text-xs text-red-500 hover:underline">Trash</button>
                  )}
                  {comment.status === "TRASH" && (
                    <button onClick={() => setDeleteId(comment.id)} className="text-xs text-red-700 hover:underline">Delete permanently</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {initialData.items.length === 0 && (
          <p className="p-8 text-center text-gray-400">No comments</p>
        )}
      </div>

      {/* Pagination */}
      {initialData.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: initialData.totalPages }, (_, i) => i + 1).map((p) => (
            <a key={p} href={`/admin/comments?page=${p}${currentStatus ? `&status=${currentStatus}` : ""}`}
              className={`px-3 py-1 rounded-sm text-sm ${p === initialData.page ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
              {p}
            </a>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete comment?"
        description="This comment and its replies will be permanently deleted."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
