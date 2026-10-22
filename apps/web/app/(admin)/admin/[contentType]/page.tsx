import { requireAdmin } from "@/lib/auth/guards";
import { checkPermissions } from "@/lib/permissions/check";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@nextpress/ui";
import { PostListTable } from "@/components/admin/posts/post-list-table";
import { notFound } from "next/navigation";

export default async function DynamicContentListPage({
  params,
  searchParams,
}: {
  params: Promise<{ contentType: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAdmin();
  const { contentType: slug } = await params;
  const sp = await searchParams;
  const perms = await checkPermissions(["create_content", "publish_content", "edit_others_content", "delete_others_content"]);

  const caller = await getServerCaller();

  // Verify content type exists
  let ct;
  try { ct = await caller.contentType.getBySlug({ slug }); } catch { notFound(); }

  const page = parseInt(sp.page ?? "1", 10);
  const result = await caller.content.list({
    contentTypeSlug: slug,
    page,
    perPage: 20,
    status: sp.status as any,
    search: sp.search,
  });

  return (
    <div>
      <PageHeader title={ct.namePlural} />
      <PostListTable
        entries={result.items}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        permissions={perms}
        currentStatus={sp.status}
        currentSearch={sp.search}
        baseUrl={`/admin/${slug}`}
      />
    </div>
  );
}
