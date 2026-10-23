import type { BlockRenderProps } from "@nextpress/blocks";
import type { PhotoGalleryAttributes } from "../lib/schema";
import PhotoGalleryRender from "./gallery-render";
import PhotoGalleryClient from "./gallery-client";

/**
 * Render dispatcher — the component registered as the block's renderComponent.
 *
 * Chooses server-side vs client-side rendering based on the block's resolved
 * render mode. The per-block `renderMode` is either an explicit "server"/
 * "client" choice, or "default" — in which case the editor has already baked
 * the site-wide setting into the block at save time, so here "default" safely
 * resolves to server-side (best SEO / no-JS support).
 *
 * Both paths render identical markup (PhotoGalleryRender is the single source
 * of truth), so output never drifts between modes.
 */
export default function PhotoGalleryDispatch(
  props: BlockRenderProps<PhotoGalleryAttributes>,
) {
  const mode = props.attributes.renderMode;
  if (mode === "client") {
    return <PhotoGalleryClient {...props} />;
  }
  return <PhotoGalleryRender {...props} />;
}
