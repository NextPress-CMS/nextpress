"use client";

import { useEffect, useRef, useState } from "react";
import { GalleryLightbox } from "./gallery-lightbox";

/**
 * Progressive-enhancement mount point for a single gallery's lightbox.
 *
 * Rendered once by the SSR gallery (when lightbox is enabled). It finds its
 * nearest `.np-pg` ancestor, reads the embedded JSON payload, and delegates
 * clicks from the server-rendered `[data-pg-open]` triggers to the viewer.
 *
 * If JavaScript never runs, the gallery still shows every photo — this only
 * adds the immersive viewer on top.
 */

interface LightboxImage {
  src: string;
  alt: string;
  caption: string;
  w: number | null;
  h: number | null;
}

export default function GalleryLightboxMount() {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [images, setImages] = useState<LightboxImage[]>([]);
  const [showCount, setShowCount] = useState(true);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    const root = anchor?.closest<HTMLElement>(".np-pg");
    if (!root) return;

    const dataEl = root.querySelector<HTMLScriptElement>("script.np-pg__data");
    if (dataEl?.textContent) {
      try {
        setImages(JSON.parse(dataEl.textContent) as LightboxImage[]);
      } catch {
        // Malformed payload — leave gallery un-enhanced.
        return;
      }
    }
    setShowCount(root.getAttribute("data-count") !== "1");

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const trigger = target.closest<HTMLElement>("[data-pg-open]");
      if (!trigger || !root!.contains(trigger)) return;
      e.preventDefault();
      const i = Number(trigger.getAttribute("data-pg-open"));
      if (Number.isNaN(i)) return;
      triggerRef.current = trigger;
      setIndex(i);
      setOpen(true);
    }

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      <span ref={anchorRef} className="np-pg__lb-anchor" aria-hidden="true" />
      {images.length > 0 && (
        <GalleryLightbox
          images={images}
          open={open}
          index={index}
          onClose={() => setOpen(false)}
          onNavigate={setIndex}
          restoreFocusTo={triggerRef.current}
          showCount={showCount}
        />
      )}
    </>
  );
}
