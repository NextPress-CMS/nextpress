import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@nextpress/ui";
import { TermManager } from "./term-manager";

export default async function TaxonomyTermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const auth = await requirePermission("manage_taxonomies");
  const { slug } = await params;
  const caller = await getServerCaller();

  let taxonomy;
  try { taxonomy = await caller.taxonomy.getBySlug({ siteId: auth.siteId, slug }); } catch { notFound(); }
  const terms = await caller.taxonomy.listTerms({ taxonomyId: taxonomy.id });

  return (
    <div>
      <PageHeader
        title={taxonomy.name}
        description={taxonomy.description ?? undefined}
        breadcrumbs={[{ label: "Taxonomies", href: "/admin/taxonomies" }, { label: taxonomy.name }]}
      />
      <TermManager
        taxonomyId={taxonomy.id}
        hierarchical={taxonomy.hierarchical}
        initialTerms={terms}
        canEdit={auth.permissions.has("manage_categories")}
      />
    </div>
  );
}
