"use client";

import type { BlockRenderProps } from "@nextpress/blocks";
import type { PhotoGalleryAttributes } from "../lib/schema";
import PhotoGalleryRender from "./gallery-render";

/**
 * Client-render wrapper.
 *
 * When an admin chooses "client-side" rendering (site default or per-block),
 * the gallery is rendered through this "use client" boundary. The visual output
 * is identical to the server renderer — it reuses the exact same markup — but it
 * hydrates as a client component, which is the hook for interactive-first
 * behaviour and avoids relying on the separate progressive-enhancement mount.
 *
 * Keeping one source of truth for the markup (PhotoGalleryRender) guarantees the
 * server and client paths never drift.
 */
export default function PhotoGalleryClient(
  props: BlockRenderProps<PhotoGalleryAttributes>,
) {
  return <PhotoGalleryRender {...props} />;
}
