import { requirePermission } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@nextpress/ui";
import { NewContentTypeForm } from "./new-content-type-form";

export default async function ContentTypesPage() {
  await requirePermission("manage_content_types");
  const caller = await getServerCaller();
  const types = await caller.contentType.list();

  return (
    <div>
      <PageHeader title="Content Types" actions={<NewContentTypeForm />} />
      <div className="bg-white rounded-lg border divide-y">
        {types.map((ct) => (
          <a
            key={ct.id}
            href={`/admin/content-types/${ct.slug}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
          >
            <div>
              <div className="font-medium">{ct.namePlural}</div>
              <div className="text-xs text-gray-400">{ct.slug} · {ct.entryCount} entries · {ct.fieldCount} fields</div>
            </div>
            {ct.isSystem && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-sm">System</span>}
          </a>
        ))}
      </div>
    </div>
  );
}
