import { requirePermission } from "@/lib/auth/guards";
import InstagramDashboard from "@nextpress/plugin-instagram-post/admin/dashboard";

/**
 * Instagram dashboard — connection status, archive counters, sync actions.
 *
 * The permission guard runs on the SERVER before anything renders. The client
 * component below fetches from routes that enforce the same permissions again,
 * so a crafted request cannot bypass this page.
 */
export default async function InstagramDashboardPage() {
  await requirePermission("instagram_read");
  return <InstagramDashboard />;
}
