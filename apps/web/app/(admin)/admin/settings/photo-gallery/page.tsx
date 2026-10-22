import { requirePermission } from "@/lib/auth/guards";
import { PhotoGallerySettingsForm } from "./settings-form";

/**
 * Photo Gallery plugin settings — requires "manage_settings".
 *
 * Lets an admin choose the default render mode (server- vs client-side) and
 * manage reusable image Collections. Collections reference existing Media
 * Library assets; the plugin stores no media of its own.
 */
export default async function PhotoGallerySettingsPage() {
  await requirePermission("manage_settings");

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold">Photo Gallery</h1>
      <p className="mb-6 text-sm text-gray-500">
        Choose how galleries render and manage reusable image collections.
      </p>
      <PhotoGallerySettingsForm />
    </div>
  );
}
