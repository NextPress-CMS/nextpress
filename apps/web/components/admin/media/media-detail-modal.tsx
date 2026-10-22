"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useToast, Button } from "@nextpress/ui";
import { ConfirmDialog } from "@nextpress/ui";
import type { MediaAssetDto } from "@nextpress/core/media/media-types";

interface Props {
  asset: MediaAssetDto;
  onClose: () => void;
}

export function MediaDetailModal({ asset, onClose }: Props) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [alt, setAlt] = useState(asset.alt ?? "");
  const [title, setTitle] = useState(asset.title ?? "");
  const [caption, setCaption] = useState(asset.caption ?? "");
  const [showDelete, setShowDelete] = useState(false);

  const updateMutation = trpc.media.update.useMutation({
    onSuccess: () => { toast("success", "Updated"); utils.media.list.invalidate(); },
    onError: (e) => toast("error", e.message),
  });

  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: () => { toast("success", "Deleted"); utils.media.list.invalidate(); onClose(); },
    onError: (e) => toast("error", e.message),
  });

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
        {/* Preview */}
        <div className="bg-gray-100 flex items-center justify-center p-4 min-h-[300px]">
          {asset.isImage ? (
            <img src={asset.url} alt={asset.alt ?? ""} className="max-w-full max-h-[60vh] object-contain rounded-sm" />
          ) : (
            <div className="text-center">
              <span className="text-5xl block mb-2">📄</span>
              <p className="text-sm text-gray-500">{asset.filename}</p>
            </div>
          )}
        </div>

        {/* Metadata form */}
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-start">
            <h2 className="text-lg font-semibold">{asset.filename}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>

          <div className="text-xs text-gray-400 space-y-1">
            <p>{asset.mimeType} · {formatSize(asset.size)}</p>
            {asset.width && <p>{asset.width} × {asset.height}px</p>}
            <p>Uploaded {new Date(asset.createdAt).toLocaleDateString()} by {asset.uploader.name}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Alt Text</label>
              <input type="text" value={alt} onChange={(e) => setAlt(e.target.value)} className="np-input w-full mt-1" placeholder="Describe this image for accessibility" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="np-input w-full mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Caption</label>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} className="np-input w-full mt-1" />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500">URL</label>
              <input type="text" readOnly value={asset.url} className="np-input w-full mt-1 bg-gray-50 text-gray-500 text-xs" onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>

            {/* Variants */}
            {Object.keys(asset.variants).length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500">Sizes</label>
                <div className="mt-1 space-y-1">
                  {Object.entries(asset.variants).map(([name, v]) => (
                    <div key={name} className="text-xs text-gray-400 flex justify-between">
                      <span>{name}</span>
                      <span>{(v as any).width}×{(v as any).height}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="primary" size="md" loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ id: asset.id, data: { alt, title, caption } })}>
              Save
            </Button>
            <Button variant="danger" size="md" onClick={() => setShowDelete(true)}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete media?"
        description={`"${asset.filename}" will be permanently deleted. This cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => deleteMutation.mutate({ id: asset.id })}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
