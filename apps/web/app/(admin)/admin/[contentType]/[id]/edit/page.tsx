import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@nextpress/ui";
import { PostEditorShell } from "@/components/admin/posts/post-editor-shell";

/** Edit an entry of any registered content type (posts have their own route). */
export default async function EditContentEntryPage({
  params,
}: {
  params: Promise<{ contentType: string; id: string }>;
}) {
  const auth = await requireAdmin();
  const { contentType: slug, id } = await params;
  const caller = await getServerCaller();

  let entry;
  try { entry = await caller.content.getById({ id }); } catch { notFound(); }
  // The URL's type must match the entry, so /admin/page/<post-id>/edit 404s
  // instead of editing a post under the wrong label.
  if (entry.contentType.slug !== slug) notFound();

  const ct = await caller.contentType.getBySlug({ slug });

  return (
    <div>
      <PageHeader
        title={`Edit: ${entry.title}`}
        breadcrumbs={[{ label: ct.namePlural, href: `/admin/${slug}` }, { label: entry.title }]}
      />
      <PostEditorShell
        contentTypeSlug={slug}
        basePath={`/admin/${slug}`}
        entryId={id}
        canPublish={auth.permissions.has("publish_content")}
        initialData={entry}
      />
    </div>
  );
}
