"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button, ConfirmDialog, EmptyState, FormField, useToast } from "@nextpress/ui";
import type { TermDto } from "@nextpress/core/taxonomy/taxonomy-types";

interface FlatTerm { term: TermDto; depth: number }

/** Depth-first flatten of the term tree for an indented list. */
function flatten(terms: TermDto[], depth = 0): FlatTerm[] {
  return terms.flatMap((t) => [{ term: t, depth }, ...flatten(t.children ?? [], depth + 1)]);
}

/** Ids of a term and all its descendants, so a term can't be moved under itself. */
function subtreeIds(term: TermDto): Set<string> {
  const ids = new Set([term.id]);
  for (const c of term.children ?? []) for (const id of subtreeIds(c)) ids.add(id);
  return ids;
}

interface Draft { name: string; slug: string; description: string; parentId: string }
const emptyDraft: Draft = { name: "", slug: "", description: "", parentId: "" };

export function TermManager({
  taxonomyId,
  hierarchical,
  initialTerms,
  canEdit,
}: {
  taxonomyId: string;
  hierarchical: boolean;
  initialTerms: TermDto[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const flat = useMemo(() => flatten(initialTerms), [initialTerms]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<TermDto | null>(null);
  const [edit, setEdit] = useState<Draft>(emptyDraft);
  const [deleting, setDeleting] = useState<TermDto | null>(null);

  const done = (msg: string) => { toast("success", msg); router.refresh(); };
  const create = trpc.taxonomy.createTerm.useMutation({
    onSuccess: () => { setDraft(emptyDraft); done("Term added"); },
    onError: (e) => toast("error", e.message),
  });
  const update = trpc.taxonomy.updateTerm.useMutation({
    onSuccess: () => { setEditing(null); done("Term saved"); },
    onError: (e) => toast("error", e.message),
  });
  const remove = trpc.taxonomy.deleteTerm.useMutation({
    onSuccess: () => done("Term deleted"),
    onError: (e) => toast("error", e.message),
  });

  const parentSelect = (value: string, onChange: (v: string) => void, exclude: Set<string>, id: string) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="np-input w-full">
      <option value="">None (top level)</option>
      {flat.filter(({ term }) => !exclude.has(term.id)).map(({ term, depth }) => (
        <option key={term.id} value={term.id}>{`${"\u2014 ".repeat(depth)}${term.name}`}</option>
      ))}
    </select>
  );

  return (
    <div className={`grid grid-cols-1 gap-6 ${canEdit ? "lg:grid-cols-[1fr_320px]" : ""}`}>
      <div className="overflow-hidden rounded-lg border bg-white">
        {flat.length === 0 ? (
          <EmptyState title="No terms yet" description={canEdit ? "Add the first term with the form on the right." : undefined} />
        ) : (
          <ul className="divide-y">
            {flat.map(({ term, depth }) =>
              editing?.id === term.id ? (
                <li key={term.id} className="space-y-3 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormField label="Name" htmlFor="edit-name">
                      <input id="edit-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="np-input w-full" />
                    </FormField>
                    <FormField label="Slug" htmlFor="edit-slug">
                      <input id="edit-slug" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} className="np-input w-full font-mono" />
                    </FormField>
                  </div>
                  <FormField label="Description" htmlFor="edit-desc">
                    <textarea id="edit-desc" rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className="np-input w-full" />
                  </FormField>
                  {hierarchical && (
                    <FormField label="Parent" htmlFor="edit-parent">
                      {parentSelect(edit.parentId, (v) => setEdit({ ...edit, parentId: v }), subtreeIds(term), "edit-parent")}
                    </FormField>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      loading={update.isPending}
                      onClick={() =>
                        update.mutate({
                          id: term.id,
                          data: {
                            name: edit.name,
                            slug: edit.slug || undefined,
                            description: edit.description || undefined,
                            ...(hierarchical ? { parentId: edit.parentId || null } : {}),
                          },
                        })
                      }
                    >
                      Save
                    </Button>
                  </div>
                </li>
              ) : (
                <li key={term.id} className="flex items-center justify-between gap-4 px-4 py-3" style={{ paddingLeft: `${1 + depth * 1.5}rem` }}>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{term.name}</div>
                    <div className="truncate text-xs text-gray-500">
                      <code>{term.slug}</code> · {term.contentCount} {term.contentCount === 1 ? "entry" : "entries"}
                      {term.description && ` · ${term.description}`}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(term);
                          setEdit({ name: term.name, slug: term.slug, description: term.description ?? "", parentId: term.parentId ?? "" });
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleting(term)}>Delete</Button>
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {canEdit && (
        <form
          className="h-fit space-y-3 rounded-lg border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              taxonomyId,
              name: draft.name,
              slug: draft.slug || undefined,
              description: draft.description || undefined,
              parentId: hierarchical && draft.parentId ? draft.parentId : null,
              sortOrder: flat.length,
            });
          }}
        >
          <h2 className="text-sm font-semibold text-gray-900">Add term</h2>
          <FormField label="Name" htmlFor="new-name" required>
            <input id="new-name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="np-input w-full" />
          </FormField>
          <FormField label="Slug" htmlFor="new-slug" description="Leave empty to generate from the name.">
            <input id="new-slug" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className="np-input w-full font-mono" />
          </FormField>
          {hierarchical && (
            <FormField label="Parent" htmlFor="new-parent">
              {parentSelect(draft.parentId, (v) => setDraft({ ...draft, parentId: v }), new Set(), "new-parent")}
            </FormField>
          )}
          <FormField label="Description" htmlFor="new-desc">
            <textarea id="new-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="np-input w-full" />
          </FormField>
          <Button type="submit" className="w-full" loading={create.isPending}>Add term</Button>
        </form>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`Delete "${deleting?.name}"?`}
        description="The term is removed from every entry that uses it. Child terms move to the top level."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => { if (deleting) await remove.mutateAsync({ id: deleting.id }); setDeleting(null); }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
