import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@nextpress/ui";
import { PostEditorShell } from "@/components/admin/posts/post-editor-shell";

/** Create an entry of any registered content type (posts have their own route). */
export default async function NewContentEntryPage({
  params,
}: {
  params: Promise<{ contentType: string }>;
}) {
  const auth = await requirePermission("create_content");
  const { contentType: slug } = await params;
  const caller = await getServerCaller();

  let ct;
  try { ct = await caller.contentType.getBySlug({ slug }); } catch { notFound(); }

  return (
    <div>
      <PageHeader
        title={`New ${ct.nameSingular}`}
        breadcrumbs={[{ label: ct.namePlural, href: `/admin/${slug}` }, { label: "New" }]}
      />
      <PostEditorShell
        contentTypeSlug={slug}
        basePath={`/admin/${slug}`}
        canPublish={auth.permissions.has("publish_content")}
      />
    </div>
  );
}
