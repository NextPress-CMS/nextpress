import { requirePermission } from "@/lib/auth/guards";
import InstagramSettingsPage from "@nextpress/plugin-instagram-post/admin/settings";

/** Synchronisation, import and publishing settings. */
export default async function InstagramSettingsRoute() {
  await requirePermission("instagram_manage_settings");
  return <InstagramSettingsPage />;
}
