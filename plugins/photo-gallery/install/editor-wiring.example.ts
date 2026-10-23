"use client";

/**
 * Host wiring for the Photo Gallery plugin editor.
 *
 * Injects the admin Media Library picker into the plugin (via its DI bridge),
 * then registers the plugin's client edit component. Imported once, as a
 * side-effect, by the post editor shell.
 *
 * `registerPhotoGalleryEditor` is a function (not a bare side-effect import) so
 * the picker is guaranteed to be injected before registration runs, regardless
 * of ES module evaluation order.
 */

import { setMediaPicker } from "@nextpress/plugin-photo-gallery/media-picker-bridge";
import { registerPhotoGalleryEditor } from "@nextpress/plugin-photo-gallery/register-editor";
import { MediaPicker } from "@/components/admin/media/media-picker";

setMediaPicker(MediaPicker);
registerPhotoGalleryEditor();
