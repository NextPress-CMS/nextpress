"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Badge, Skeleton } from "@nextpress/ui";
import { MediaDetailModal } from "./media-detail-modal";
import type { MediaAssetDto } from "@nextpress/core/media/media-types";

interface Props {
  initialData?: { items: MediaAssetDto[]; total: number; page: number; perPage: number; totalPages: number };
  selectionMode?: boolean;
  onSelect?: (asset: MediaAssetDto) => void;
}

export function MediaGrid({ initialData, selectionMode, onSelect }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState<MediaAssetDto | null>(null);

  const { data, isLoading } = trpc.media.list.useQuery(
    { page, perPage: 24, sortBy: "createdAt", sortOrder: "desc", mimeType: filter || undefined, search: search || undefined },
    { initialData: page === 1 && !filter && !search ? initialData : undefined },
  );

  function handleClick(asset: MediaAssetDto) {
    if (selectionMode && onSelect) {
      onSelect(asset);
    } else {
      setSelectedAsset(asset);
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search media..."
          className="np-input w-64"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select className="np-input" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          <option value="image">Images</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="document">Documents</option>
        </select>
        <span className="text-sm text-gray-400 ml-auto">{data?.total ?? 0} items</span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {data?.items.map((asset) => (
            <button
              key={asset.id}
              onClick={() => handleClick(asset)}
              className="group relative aspect-square bg-gray-100 rounded-lg overflow-hidden border hover:ring-2 hover:ring-blue-500 transition-all"
            >
              {asset.isImage ? (
                <img
                  src={asset.variants.thumbnail?.url ?? asset.url}
                  alt={asset.alt ?? asset.filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-2">
                  <span className="text-2xl mb-1">
                    {asset.mimeType.startsWith("video/") ? "🎬" :
                     asset.mimeType.startsWith("audio/") ? "🎵" : "📄"}
                  </span>
                  <span className="text-xs text-gray-500 truncate w-full text-center">
                    {asset.filename}
                  </span>
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-linear-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-xs text-white truncate">{asset.filename}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {data?.items.length === 0 && !isLoading && (
        <p className="text-center text-gray-400 py-12">No media found</p>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-3 py-1 rounded text-sm ${
                p === page ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedAsset && (
        <MediaDetailModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
        />
      )}
    </div>
  );
}
