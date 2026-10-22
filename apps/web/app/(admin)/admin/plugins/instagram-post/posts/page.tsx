import { requirePermission } from "@/lib/auth/guards";
import InstagramPostsPage from "@nextpress/plugin-instagram-post/admin/posts";

/** Archived posts, with source and sync status made unambiguous. */
export default async function InstagramPostsRoute() {
  await requirePermission("instagram_read");
  return <InstagramPostsPage />;
}
