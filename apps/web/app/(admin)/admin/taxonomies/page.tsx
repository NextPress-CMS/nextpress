import { requirePermission } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, EmptyState } from "@nextpress/ui";

/** Taxonomies on the current site; each links to its term manager. */
export default async function TaxonomiesPage() {
  await requirePermission("manage_taxonomies");
  const caller = await getServerCaller();
  const taxonomies = await caller.taxonomy.list();

  return (
    <div>
      <PageHeader title="Taxonomies" description="Manage categories, tags, and custom taxonomies" />
      {taxonomies.length === 0 ? (
        <EmptyState title="No taxonomies yet" />
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {taxonomies.map((t) => (
            <a key={t.id} href={`/admin/taxonomies/${t.slug}/terms`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-gray-400">
                  {t.slug} · {t.termCount} {t.termCount === 1 ? "term" : "terms"}
                  {t.hierarchical ? " · hierarchical" : ""}
                  {t.contentTypes.length > 0 ? ` · used by ${t.contentTypes.join(", ")}` : ""}
                </div>
              </div>
              {t.isSystem && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-sm">System</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
