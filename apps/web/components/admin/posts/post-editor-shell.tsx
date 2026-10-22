"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { NextPressEditor } from "@nextpress/editor";
// Register plugin editor blocks (side-effect). The plugin API only carries the
// server render side of a block; this bridges the client edit component in.
import "@/lib/plugins/photo-gallery-editor";
import { trpc } from "@/lib/trpc/client";
import { useToast, Button } from "@nextpress/ui";
import { useAutosave } from "@/hooks/use-autosave";
import { StatusControls } from "./status-controls";
import type { BlockData } from "@nextpress/blocks";

interface Props {
  contentTypeSlug: string;
  entryId?: string;
  canPublish: boolean;
  initialData?: {
    title: string;
    slug: string;
    blocks: BlockData[];
    status: string;
    excerpt: string | null;
  };
}

export function PostEditorShell({ contentTypeSlug, entryId, canPublish, initialData }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [blocks, setBlocks] = useState<BlockData[]>(initialData?.blocks ?? []);
  const [status, setStatus] = useState(initialData?.status ?? "DRAFT");
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const createMutation = trpc.content.create.useMutation();
  const updateMutation = trpc.content.update.useMutation();
  const autosaveMutation = trpc.content.autosave.useMutation();
  const publishMutation = trpc.content.publish.useMutation();
  const scheduleMutation = trpc.content.schedule.useMutation();
  const trashMutation = trpc.content.trash.useMutation();
  const submitReviewMutation = trpc.content.submitForReview.useMutation();
  const approveMutation = trpc.content.approveReview.useMutation();
  const requestChangesMutation = trpc.content.requestChanges.useMutation();

  // Get review status
  const reviewQuery = trpc.content.reviewStatus.useQuery(
    { id: entryId! },
    { enabled: !!entryId },
  );

  /**
   * EXPLICIT SAVE — creates a revision.
   * Called by "Save Draft" and "Update" buttons.
   */
  const save = useCallback(async () => {
    try {
      if (entryId) {
        await updateMutation.mutateAsync({
          id: entryId,
          data: { title, blocks },
        });
        toast("success", "Saved");
      } else {
        const result = await createMutation.mutateAsync({
          contentTypeSlug,
          title,
          blocks,
          status: "DRAFT",
        });
        toast("success", "Draft created");
        router.push(`/admin/posts/${result.id}/edit`);
      }
      setIsDirty(false);
      setLastSavedAt(new Date());
    } catch (e: any) {
      toast("error", e.message ?? "Save failed");
    }
  }, [entryId, title, blocks, contentTypeSlug, updateMutation, createMutation, toast, router]);

  /**
   * AUTOSAVE — lightweight, does NOT create a revision.
   * Prevents revision spam during active editing.
   */
  const autosave = useCallback(async () => {
    if (!entryId) return;
    try {
      const result = await autosaveMutation.mutateAsync({
        id: entryId,
        title,
        blocks,
      });
      if (result.savedAt) {
        setLastSavedAt(new Date(result.savedAt));
      }
    } catch {
      // Silent failure for autosave — user will see "Unsaved changes"
    }
  }, [entryId, title, blocks, autosaveMutation]);

  // Autosave every 30 seconds (lightweight, no revision)
  useAutosave(isDirty && !!entryId, autosave, 30_000);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      {/* Main editor area */}
      <div className="space-y-4">
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
          placeholder="Enter title..."
          className="w-full text-3xl font-bold border-0 outline-hidden bg-transparent placeholder:text-gray-300"
          autoFocus
        />

        <div className="bg-white rounded-lg border min-h-[400px]">
          <NextPressEditor
            initialBlocks={blocks}
            onChange={(newBlocks) => { setBlocks(newBlocks); setIsDirty(true); }}
          />
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <StatusControls
          status={status}
          isDirty={isDirty}
          isSaving={isSaving}
          lastSavedAt={lastSavedAt}
          canPublish={canPublish}
          onSave={save}
          onPublish={async () => {
            if (!entryId) { await save(); return; }
            try {
              await publishMutation.mutateAsync({ id: entryId });
              setStatus("PUBLISHED");
              setIsDirty(false);
              toast("success", "Published");
            } catch (e: any) { toast("error", e.message ?? "Publish failed"); }
          }}
          onSchedule={async (date) => {
            if (!entryId) { await save(); return; }
            try {
              await scheduleMutation.mutateAsync({ id: entryId, scheduledAt: date });
              setStatus("SCHEDULED");
              toast("success", `Scheduled for ${date.toLocaleString()}`);
            } catch (e: any) { toast("error", e.message ?? "Schedule failed"); }
          }}
          onSubmitForReview={!canPublish ? async (note) => {
            if (!entryId) { await save(); return; }
            try {
              await submitReviewMutation.mutateAsync({ id: entryId, note });
              setStatus("PENDING_REVIEW");
              toast("success", "Submitted for review");
            } catch (e: any) { toast("error", e.message ?? "Submit failed"); }
          } : undefined}
          onApproveReview={canPublish ? async () => {
            if (!entryId) return;
            try {
              await approveMutation.mutateAsync({ id: entryId });
              setStatus("PUBLISHED");
              toast("success", "Approved and published");
            } catch (e: any) { toast("error", e.message ?? "Approve failed"); }
          } : undefined}
          onRequestChanges={canPublish ? async (note) => {
            if (!entryId) return;
            try {
              await requestChangesMutation.mutateAsync({ id: entryId, note });
              setStatus("DRAFT");
              toast("info", "Changes requested");
            } catch (e: any) { toast("error", e.message ?? "Request failed"); }
          } : undefined}
          onTrash={entryId ? async () => {
            await trashMutation.mutateAsync({ id: entryId });
            router.push("/admin/posts");
          } : undefined}
          reviewNote={
            reviewQuery.data?.status === "changes_requested"
              ? reviewQuery.data.note
              : null
          }
        />
      </div>
    </div>
  );
}
