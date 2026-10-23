"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button, ConfirmDialog, FormField, useToast } from "@nextpress/ui";

interface Props {
  user: {
    id: string;
    email: string;
    name: string;
    displayName: string;
    bio: string;
    roleSlug: string;
    roleName: string;
    joinedAt: string;
    entryCount: number;
  };
  roles: Array<{ slug: string; name: string; description: string | null }>;
  isSelf: boolean;
  canEdit: boolean;
  canPromote: boolean;
  canDelete: boolean;
}

export function UserDetailForm({ user, roles, isSelf, canEdit, canPromote, canDelete }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(user.name);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio);
  const [roleSlug, setRoleSlug] = useState(user.roleSlug);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const update = trpc.user.update.useMutation({
    onSuccess: () => { toast("success", "User saved"); router.refresh(); },
    onError: (e) => toast("error", e.message),
  });
  const remove = trpc.user.delete.useMutation({
    onSuccess: () => { toast("success", "User removed from this site"); router.push("/admin/users"); },
    onError: (e) => toast("error", e.message),
  });

  const roleEditable = canPromote && !isSelf;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <form
        className="space-y-4 rounded-lg border bg-white p-6"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({
            id: user.id,
            name,
            displayName: displayName || null,
            bio: bio || null,
            ...(roleEditable && roleSlug !== user.roleSlug ? { roleSlug } : {}),
          });
        }}
      >
        <FormField label="Email" htmlFor="email" description="Email cannot be changed here.">
          <input id="email" value={user.email} disabled className="np-input w-full" />
        </FormField>
        <FormField label="Name" htmlFor="name" required>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} required className="np-input w-full" />
        </FormField>
        <FormField label="Display name" htmlFor="displayName" description="Shown publicly on posts. Falls back to the name.">
          <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={!canEdit} className="np-input w-full" />
        </FormField>
        <FormField label="Bio" htmlFor="bio">
          <textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} disabled={!canEdit} className="np-input w-full" />
        </FormField>
        <FormField
          label="Role"
          htmlFor="role"
          description={isSelf ? "You cannot change your own role." : !canPromote ? "You do not have permission to change roles." : undefined}
        >
          <select id="role" value={roleSlug} onChange={(e) => setRoleSlug(e.target.value)} disabled={!roleEditable} className="np-input w-full">
            {roles.map((r) => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </FormField>
        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" loading={update.isPending}>Save changes</Button>
          </div>
        )}
      </form>

      <aside className="space-y-4">
        <div className="space-y-2 rounded-lg border bg-white p-4 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Role</span><span>{user.roleName}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Joined</span><span>{new Date(user.joinedAt).toLocaleDateString()}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Entries</span><span>{user.entryCount}</span></div>
        </div>
        {canDelete && !isSelf && (
          <Button variant="danger" className="w-full" onClick={() => setConfirmRemove(true)}>
            Remove from site
          </Button>
        )}
      </aside>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this user?"
        description="They lose access to this site. Their account and content are kept."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={async () => { await remove.mutateAsync({ userId: user.id }); setConfirmRemove(false); }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
