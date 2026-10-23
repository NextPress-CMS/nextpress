import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@nextpress/ui";
import { UserDetailForm } from "./user-detail-form";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("list_users");
  const { id } = await params;
  const caller = await getServerCaller();

  let user;
  try { user = await caller.user.getById({ id }); } catch { notFound(); }
  const roles = await caller.user.roles();
  const label = user.displayName || user.name || user.email;

  return (
    <div>
      <PageHeader title={label} breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label }]} />
      <UserDetailForm
        user={{
          id: user.id,
          email: user.email,
          name: user.name ?? "",
          displayName: user.displayName ?? "",
          bio: user.bio ?? "",
          roleSlug: user.role.slug,
          roleName: user.role.name,
          joinedAt: user.joinedAt.toISOString(),
          entryCount: user.entryCount,
        }}
        roles={roles}
        isSelf={user.id === auth.user.id}
        canEdit={auth.permissions.has("edit_users")}
        canPromote={auth.permissions.has("promote_users")}
        canDelete={auth.permissions.has("delete_users")}
      />
    </div>
  );
}
