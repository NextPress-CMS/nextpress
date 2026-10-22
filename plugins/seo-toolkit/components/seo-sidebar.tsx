"use client";

/**
 * SEO sidebar panel for the content editor.
 * Shows SEO title preview, meta description with character count,
 * canonical URL, and robots directive.
 */
export default function SeoSidebar({
  fields,
  onFieldChange,
}: {
  fields: Record<string, unknown>;
  onFieldChange: (key: string, value: unknown) => void;
}) {
  const title = (fields._seo_title as string) ?? "";
  const description = (fields._seo_description as string) ?? "";

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-500">SEO Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onFieldChange("_seo_title", e.target.value)}
          maxLength={70}
          className="np-input w-full mt-1"
          placeholder="Page title for search engines"
        />
        <span className="text-xs text-gray-400">{title.length}/70</span>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500">Meta Description</label>
        <textarea
          value={description}
          onChange={(e) => onFieldChange("_seo_description", e.target.value)}
          maxLength={160}
          rows={3}
          className="np-input w-full mt-1"
          placeholder="Describe this page in 160 characters"
        />
        <span className={`text-xs ${description.length > 160 ? "text-red-500" : "text-gray-400"}`}>
          {description.length}/160
        </span>
      </div>

      {/* Search preview */}
      <div className="border rounded-sm p-3 bg-gray-50">
        <p className="text-xs text-gray-400 mb-1">Search preview</p>
        <p className="text-blue-700 text-sm font-medium truncate">
          {title || "Page Title"}
        </p>
        <p className="text-xs text-green-700">example.com/page-slug</p>
        <p className="text-xs text-gray-600 line-clamp-2">
          {description || "No description set."}
        </p>
      </div>
    </div>
  );
}
