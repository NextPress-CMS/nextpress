import { requirePermission } from "@/lib/auth/guards";
import InstagramImport from "@nextpress/plugin-instagram-post/admin/import";

/** Historical import — preview, then run resumable server-side batches. */
export default async function InstagramImportPage() {
  await requirePermission("instagram_import");
  return <InstagramImport />;
}
