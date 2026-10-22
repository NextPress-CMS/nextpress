"use client";

import { useState } from "react";
import { Button } from "@nextpress/ui";

interface Props {
  status: string;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt?: Date | null;
  canPublish: boolean;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onSchedule?: (date: Date) => Promise<void>;
  onSubmitForReview?: (note?: string) => Promise<void>;
  onApproveReview?: () => Promise<void>;
  onRequestChanges?: (note: string) => Promise<void>;
  onTrash?: () => Promise<void>;
  reviewNote?: string | null;
}

export function StatusControls({
  status, isDirty, isSaving, lastSavedAt, canPublish,
  onSave, onPublish, onSchedule, onSubmitForReview,
  onApproveReview, onRequestChanges, onTrash, reviewNote,
}: Props) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [showReviewInput, setShowReviewInput] = useState(false);
  const [reviewNoteText, setReviewNoteText] = useState("");
  const [changesNote, setChangesNote] = useState("");

  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Publish</h3>

      <div className="text-sm text-gray-500">
        Status: <span className="font-medium capitalize">{status.replace(/_/g, " ").toLowerCase()}</span>
      </div>

      {lastSavedAt && (
        <p className="text-xs text-gray-400">Last saved: {lastSavedAt.toLocaleTimeString()}</p>
      )}

      {reviewNote && status === "DRAFT" && (
        <div className="rounded-sm bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          <strong>Changes requested:</strong> {reviewNote}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="outline" size="md" onClick={onSave} loading={isSaving} disabled={!isDirty}>
          Save Draft
        </Button>

        {canPublish && status !== "PUBLISHED" && status !== "PENDING_REVIEW" && (
          <Button variant="primary" size="md" onClick={onPublish}>Publish</Button>
        )}

        {status === "PUBLISHED" && isDirty && (
          <Button variant="primary" size="md" onClick={onSave} loading={isSaving}>Update</Button>
        )}

        {!canPublish && status === "DRAFT" && onSubmitForReview && (
          <>
            <Button variant="primary" size="md" onClick={() => setShowReviewInput(!showReviewInput)}>
              Submit for Review
            </Button>
            {showReviewInput && (
              <div className="space-y-2">
                <textarea value={reviewNoteText} onChange={(e) => setReviewNoteText(e.target.value)}
                  placeholder="Note for reviewer (optional)" rows={2} className="np-input w-full text-sm" />
                <Button variant="primary" size="sm" onClick={async () => {
                  await onSubmitForReview(reviewNoteText || undefined);
                  setShowReviewInput(false);
                }}>
                  Submit
                </Button>
              </div>
            )}
          </>
        )}

        {status === "PENDING_REVIEW" && canPublish && (
          <>
            {onApproveReview && (
              <Button variant="primary" size="md" onClick={onApproveReview}>Approve & Publish</Button>
            )}
            {onRequestChanges && (
              <>
                <Button variant="outline" size="md" onClick={() => setShowReviewInput(!showReviewInput)}>
                  Request Changes
                </Button>
                {showReviewInput && (
                  <div className="space-y-2">
                    <textarea value={changesNote} onChange={(e) => setChangesNote(e.target.value)}
                      placeholder="What needs to change?" rows={3} className="np-input w-full text-sm" />
                    <Button variant="outline" size="sm" disabled={!changesNote.trim()}
                      onClick={async () => { await onRequestChanges(changesNote); setShowReviewInput(false); }}>
                      Send Feedback
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {canPublish && status === "DRAFT" && onSchedule && (
          <>
            <button onClick={() => setShowSchedule(!showSchedule)}
              className="text-xs text-blue-600 hover:text-blue-800 text-left">
              {showSchedule ? "Cancel" : "Schedule for later..."}
            </button>
            {showSchedule && (
              <div className="space-y-2">
                <input type="datetime-local" value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)} className="np-input w-full text-sm" />
                <Button variant="primary" size="sm" disabled={!scheduleDate}
                  onClick={async () => { await onSchedule(new Date(scheduleDate)); setShowSchedule(false); }}>
                  Schedule
                </Button>
              </div>
            )}
          </>
        )}

        {status === "SCHEDULED" && (
          <p className="text-xs text-blue-600">Scheduled — will publish automatically.</p>
        )}
      </div>

      {onTrash && (
        <button onClick={onTrash} className="text-xs text-red-500 hover:text-red-700 mt-2">
          Move to Trash
        </button>
      )}
    </div>
  );
}
