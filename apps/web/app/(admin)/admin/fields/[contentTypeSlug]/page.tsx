import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@nextpress/ui";
import { FieldManager } from "./field-manager";

/** Field groups for one content type. Site-global fields are shown read-only. */
export default async function ContentTypeFieldsPage({
  params,
}: {
  params: Promise<{ contentTypeSlug: string }>;
}) {
  await requirePermission("manage_fields");
  const { contentTypeSlug } = await params;
  const caller = await getServerCaller();

  let ct;
  try { ct = await caller.contentType.getBySlug({ slug: contentTypeSlug }); } catch { notFound(); }
  const fields = await caller.field.listByContentType({ contentTypeId: ct.id });

  return (
    <div>
      <PageHeader
        title={`${ct.namePlural}: fields`}
        description="Custom fields are grouped into panels in the entry editor."
        breadcrumbs={[
          { label: "Content Types", href: "/admin/content-types" },
          { label: ct.namePlural, href: `/admin/content-types/${ct.slug}` },
          { label: "Fields" },
        ]}
      />
      <FieldManager contentTypeId={ct.id} initialFields={fields} />
    </div>
  );
}
