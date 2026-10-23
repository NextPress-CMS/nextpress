"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button, FormField, useToast } from "@nextpress/ui";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Header button that expands into a minimal create form; details are edited on the detail page. */
export function NewContentTypeForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [nameSingular, setNameSingular] = useState("");
  const [namePlural, setNamePlural] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const create = trpc.contentType.create.useMutation({
    onSuccess: (ct) => { toast("success", "Content type created"); router.push(`/admin/content-types/${ct.slug}`); },
    onError: (e) => toast("error", e.message),
  });

  if (!open) return <Button onClick={() => setOpen(true)}>New Content Type</Button>;

  return (
    <form
      className="absolute right-6 z-10 mt-2 w-80 space-y-3 rounded-lg border bg-white p-4 shadow-lg"
      onSubmit={(e) => { e.preventDefault(); create.mutate({ slug, nameSingular, namePlural }); }}
    >
      <FormField label="Singular name" htmlFor="ct-singular" required>
        <input
          id="ct-singular"
          autoFocus
          required
          value={nameSingular}
          onChange={(e) => { setNameSingular(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
          placeholder="Recipe"
          className="np-input w-full"
        />
      </FormField>
      <FormField label="Plural name" htmlFor="ct-plural" required>
        <input id="ct-plural" required value={namePlural} onChange={(e) => setNamePlural(e.target.value)} placeholder="Recipes" className="np-input w-full" />
      </FormField>
      <FormField label="Slug" htmlFor="ct-slug" required description="Used in admin and site URLs. Cannot be changed later.">
        <input id="ct-slug" required value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} className="np-input w-full font-mono" />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" size="sm" loading={create.isPending}>Create</Button>
      </div>
    </form>
  );
}
