import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@nextpress/ui";
import { ContentTypeForm } from "./content-type-form";

export default async function ContentTypeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePermission("manage_content_types");
  const { slug } = await params;
  const caller = await getServerCaller();

  let ct;
  try { ct = await caller.contentType.getBySlug({ slug }); } catch { notFound(); }

  return (
    <div>
      <PageHeader
        title={ct.namePlural}
        description={`${ct.slug} · ${ct.entryCount} entries · ${ct.fieldCount} fields`}
        breadcrumbs={[{ label: "Content Types", href: "/admin/content-types" }, { label: ct.namePlural }]}
        actions={
          <div className="flex gap-2">
            <a href={`/admin/fields/${ct.slug}`} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50">
              Manage fields
            </a>
            <a href={ct.slug === "post" ? "/admin/posts" : `/admin/${ct.slug}`} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50">
              View entries
            </a>
          </div>
        }
      />
      <ContentTypeForm contentType={ct} />
    </div>
  );
}
