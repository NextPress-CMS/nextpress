"use client";

import { trpc } from "@/lib/trpc/client";
import { SettingsForm } from "./settings-form";

interface Props {
  groupSlug: string;
}

/**
 * Client wrapper that fetches group definition + values,
 * then renders the SettingsForm. Used by each settings sub-page.
 */
export function SettingsPageClient({ groupSlug }: Props) {
  const { data: groups, isLoading: loadingGroups } = trpc.settings.getGroups.useQuery();
  const { data: values, isLoading: loadingValues } = trpc.settings.getGroup.useQuery({ group: groupSlug });

  if (loadingGroups || loadingValues) {
    return (
      <div className="max-w-2xl">
        <div className="bg-white rounded-lg border p-6 space-y-4 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-4 bg-gray-100 rounded w-72" />
          <div className="space-y-3 pt-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-gray-100 rounded w-24" />
                <div className="h-9 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const group = groups?.find((g) => g.slug === groupSlug);

  if (!group) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center text-gray-400 max-w-2xl">
        <p>Settings group &ldquo;{groupSlug}&rdquo; not found.</p>
      </div>
    );
  }

  return <SettingsForm group={group} values={values ?? {}} />;
}
