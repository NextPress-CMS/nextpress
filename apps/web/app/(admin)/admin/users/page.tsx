import { requirePermission } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, EmptyState } from "@nextpress/ui";

/** Users on the current site. Requires "list_users". */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("list_users");
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const caller = await getServerCaller();
  const result = await caller.user.list({ page, perPage: 20, search: sp.search || undefined });

  return (
    <div>
      <PageHeader title="Users" description={`${result.total} ${result.total === 1 ? "user" : "users"} on this site`} />

      <form className="mb-4" action="/admin/users">
        <input
          name="search"
          defaultValue={sp.search ?? ""}
          placeholder="Search by name or email"
          className="np-input w-full max-w-sm"
        />
      </form>

      {result.users.length === 0 ? (
        <EmptyState title="No users found" description={sp.search ? "Try a different search." : undefined} />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <a href={`/admin/users/${u.id}`} className="font-medium text-indigo-600 hover:underline">
                      {u.displayName || u.name || u.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{u.role?.name ?? "No role"}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>Page {result.page} of {result.totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a className="rounded border px-3 py-1 hover:bg-gray-50" href={`/admin/users?page=${page - 1}${sp.search ? `&search=${encodeURIComponent(sp.search)}` : ""}`}>Previous</a>
            )}
            {page < result.totalPages && (
              <a className="rounded border px-3 py-1 hover:bg-gray-50" href={`/admin/users?page=${page + 1}${sp.search ? `&search=${encodeURIComponent(sp.search)}` : ""}`}>Next</a>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
