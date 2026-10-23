"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button, ConfirmDialog, FormField, useToast } from "@nextpress/ui";
import type { ContentTypeDto } from "@nextpress/core/content-type/content-type-types";

const SUPPORT_OPTIONS = [
  { value: "title", label: "Title" },
  { value: "editor", label: "Block editor" },
  { value: "excerpt", label: "Excerpt" },
  { value: "thumbnail", label: "Featured image" },
  { value: "comments", label: "Comments" },
  { value: "revisions", label: "Revisions" },
  { value: "custom-fields", label: "Custom fields" },
  { value: "page-attributes", label: "Page attributes" },
] as const;

type Support = (typeof SUPPORT_OPTIONS)[number]["value"];

export function ContentTypeForm({ contentType: ct }: { contentType: ContentTypeDto }) {
  const router = useRouter();
  const { toast } = useToast();
  const [nameSingular, setNameSingular] = useState(ct.nameSingular);
  const [namePlural, setNamePlural] = useState(ct.namePlural);
  const [description, setDescription] = useState(ct.description ?? "");
  const [hierarchical, setHierarchical] = useState(ct.hierarchical);
  const [hasArchive, setHasArchive] = useState(ct.hasArchive);
  const [isPublic, setIsPublic] = useState(ct.isPublic);
  const [supports, setSupports] = useState<Support[]>(ct.supports as Support[]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = trpc.contentType.update.useMutation({
    onSuccess: () => { toast("success", "Content type saved"); router.refresh(); },
    onError: (e) => toast("error", e.message),
  });
  const remove = trpc.contentType.delete.useMutation({
    onSuccess: () => { toast("success", "Content type deleted"); router.push("/admin/content-types"); },
    onError: (e) => toast("error", e.message),
  });

  const toggleSupport = (s: Support) =>
    setSupports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <form
        className="space-y-4 rounded-lg border bg-white p-6"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({
            id: ct.id,
            data: { nameSingular, namePlural, description: description || undefined, hierarchical, hasArchive, isPublic, supports },
          });
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Singular name" htmlFor="nameSingular" required>
            <input id="nameSingular" value={nameSingular} onChange={(e) => setNameSingular(e.target.value)} required maxLength={100} className="np-input w-full" />
          </FormField>
          <FormField label="Plural name" htmlFor="namePlural" required>
            <input id="namePlural" value={namePlural} onChange={(e) => setNamePlural(e.target.value)} required maxLength={100} className="np-input w-full" />
          </FormField>
        </div>
        <FormField label="Slug" htmlFor="slug" description="The slug is fixed once a content type exists.">
          <input id="slug" value={ct.slug} disabled className="np-input w-full" />
        </FormField>
        <FormField label="Description" htmlFor="description">
          <textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="np-input w-full" />
        </FormField>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Supports</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SUPPORT_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={supports.includes(o.value)} onChange={() => toggleSupport(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Behaviour</legend>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public (visible on the site)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={hasArchive} onChange={(e) => setHasArchive(e.target.checked)} /> Has an archive page
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={hierarchical} onChange={(e) => setHierarchical(e.target.checked)} /> Hierarchical (entries can have parents)
          </label>
        </fieldset>

        <div className="flex justify-end">
          <Button type="submit" loading={update.isPending}>Save changes</Button>
        </div>
      </form>

      <aside className="space-y-4">
        <div className="space-y-2 rounded-lg border bg-white p-4 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Entries</span><span>{ct.entryCount}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Fields</span><span>{ct.fieldCount}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Type</span><span>{ct.isSystem ? "System" : "Custom"}</span></div>
        </div>
        {!ct.isSystem && (
          <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}>
            Delete content type
          </Button>
        )}
      </aside>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${ct.namePlural}"?`}
        description="This permanently removes the content type. Deletion is refused while entries still exist."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => { await remove.mutateAsync({ id: ct.id }); setConfirmDelete(false); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
