"use client";

import { useRouter } from "next/navigation";
import { DataTable, StatusBadge, type Column } from "@nextpress/ui";
import type { ContentEntryListDto } from "@nextpress/core/content/content-types";

interface Props {
  entries: ContentEntryListDto[];
  total: number;
  page: number;
  totalPages: number;
  permissions: Record<string, boolean>;
  currentStatus?: string;
  currentSearch?: string;
  baseUrl: string;
}

export function PostListTable({
  entries, total, page, totalPages, permissions, currentStatus, currentSearch, baseUrl,
}: Props) {
  const router = useRouter();

  const columns: Column<ContentEntryListDto>[] = [
    {
      key: "title",
      header: "Title",
      sortable: true,
      cell: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.title}</div>
          <div className="text-xs text-gray-400">/{row.slug}</div>
        </div>
      ),
    },
    {
      key: "author",
      header: "Author",
      cell: (row) => <span className="text-sm">{row.author.displayName ?? row.author.name ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "createdAt",
      header: "Date",
      sortable: true,
      cell: (row) => (
        <span className="text-sm text-gray-500">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "comments",
      header: "Comments",
      cell: (row) => <span className="text-sm">{row.commentCount}</span>,
      className: "text-center",
    },
  ];

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search..."
          defaultValue={currentSearch}
          className="np-input w-64"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = (e.target as HTMLInputElement).value;
              const params = new URLSearchParams();
              if (v) params.set("search", v);
              if (currentStatus) params.set("status", currentStatus);
              router.push(`${baseUrl}?${params}`);
            }
          }}
        />
        <select
          className="np-input"
          defaultValue={currentStatus ?? ""}
          onChange={(e) => {
            const params = new URLSearchParams();
            if (e.target.value) params.set("status", e.target.value);
            if (currentSearch) params.set("search", currentSearch);
            router.push(`${baseUrl}?${params}`);
          }}
        >
          <option value="">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_REVIEW">Pending</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="TRASH">Trash</option>
        </select>
        <span className="text-sm text-gray-400 ml-auto">{total} total</span>
      </div>

      <DataTable
        columns={columns}
        data={entries}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => router.push(`${baseUrl}/${row.id}/edit`)}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`${baseUrl}?page=${p}${currentStatus ? `&status=${currentStatus}` : ""}${currentSearch ? `&search=${currentSearch}` : ""}`}
              className={`px-3 py-1 rounded-sm text-sm ${p === page ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
