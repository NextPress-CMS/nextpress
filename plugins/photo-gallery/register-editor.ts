/**
 * Client-side editor registration (the minimal editor bridge).
 *
 * The NextPress PluginContext only registers the server render side of a
 * block. To give the gallery a real in-editor experience, this module
 * registers the client edit component with the editor's client registry —
 * exactly the same mechanism core blocks use (see
 * packages/editor/src/blocks/image/index.ts).
 *
 * It is imported once by the admin editor shell as a side-effect. It is
 * client-only and never reaches the public site bundle.
 */

import { registerEditorBlock } from "@nextpress/editor";
import PhotoGalleryEditor from "./components/gallery-editor";
import {
  photoGallerySchema,
  photoGalleryDefaults,
  PHOTO_GALLERY_VERSION,
  PHOTO_GALLERY_BLOCK_TYPE,
} from "./lib/schema";

let registered = false;

/** Register the gallery edit component with the editor. Idempotent. */
export function registerPhotoGalleryEditor(): void {
  if (registered) return;
  registered = true;
  registerEditorBlock({
    type: PHOTO_GALLERY_BLOCK_TYPE,
    title: "Photo Gallery",
    description: "A responsive gallery with an immersive lightbox.",
    icon: "images",
    category: "media",
    keywords: ["gallery", "photos", "images", "grid", "mosaic", "masonry"],
    attributesSchema: photoGallerySchema,
    defaultAttributes: photoGalleryDefaults,
    version: PHOTO_GALLERY_VERSION,
    allowsInnerBlocks: false,
    source: "photo-gallery",
    renderComponent: null,
    editComponent: PhotoGalleryEditor,
  });
}
