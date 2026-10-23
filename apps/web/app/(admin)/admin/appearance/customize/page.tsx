import { requirePermission } from "@/lib/auth/guards";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@nextpress/ui";
import { Customizer, type SettingProperty } from "./customizer";

export default async function CustomizePage() {
  await requirePermission("customize_theme");
  const caller = await getServerCaller();
  const active = await caller.theme.getActiveSettings();

  // theme.json declares settings as { type: "object", properties: {...} }.
  const raw = (active.settings as { properties?: Record<string, SettingProperty> }).properties ?? {};

  return (
    <div>
      <PageHeader
        title="Customize"
        description={`Settings for the active theme: ${active.name}`}
        breadcrumbs={[{ label: "Themes", href: "/admin/appearance/themes" }, { label: "Customize" }]}
      />
      <Customizer properties={raw} initialValues={active.customizations} />
    </div>
  );
}
