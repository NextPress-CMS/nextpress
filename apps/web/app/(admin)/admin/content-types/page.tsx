import { requirePermission } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, Button } from "@nextpress/ui";

export default async function ContentTypesPage() {
  const auth = await requirePermission("manage_content_types");
  const caller = await getServerCaller();
  const types = await caller.contentType.list();

  return (
    <div>
      <PageHeader title="Content Types" actions={<Button>New Content Type</Button>} />
      <div className="bg-white rounded-lg border divide-y">
        {types.map((ct) => (
          <div
            key={ct.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div>
              <div className="font-medium">{ct.namePlural}</div>
              <div className="text-xs text-gray-400">{ct.slug} · {ct.entryCount} entries · {ct.fieldCount} fields</div>
            </div>
            {ct.isSystem && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-sm">System</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
