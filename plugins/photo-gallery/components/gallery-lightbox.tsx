"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nextIndex, prevIndex, clampIndex } from "../lib/layouts";

/**
 * Immersive, accessible lightbox — the client enhancement layer.
 *
 * Attaches to gallery triggers rendered server-side (buttons with
 * `data-pg-open`), reading image data from the embedded JSON payload. The
 * gallery is fully usable without this component; it only enhances.
 *
 * Accessibility & UX:
 *  - dialog semantics, labelled controls, focus trap, focus restore
 *  - Escape / ArrowLeft / ArrowRight keyboard nav
 *  - touch swipe (pointer events, no fragile custom gesture stack)
 *  - scroll lock without layout shift (scrollbar-gutter compensation)
 *  - respects prefers-reduced-motion
 *  - preloads only current ± 1 (never the whole gallery)
 */

interface LightboxImage {
  src: string;
  alt: string;
  caption: string;
  w: number | null;
  h: number | null;
}

interface Props {
  images: LightboxImage[];
  open: boolean;
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  /** Element to restore focus to when closed. */
  restoreFocusTo: HTMLElement | null;
  showCount: boolean;
}

function preload(src: string | undefined) {
  if (!src || typeof Image === "undefined") return;
  const img = new Image();
  img.src = src;
}

export function GalleryLightbox({
  images,
  open,
  index,
  onClose,
  onNavigate,
  restoreFocusTo,
  showCount,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const count = images.length;
  const current = clampIndex(index, count);
  const active = images[current];

  const goNext = useCallback(
    () => onNavigate(nextIndex(current, count)),
    [current, count, onNavigate],
  );
  const goPrev = useCallback(
    () => onNavigate(prevIndex(current, count)),
    [current, count, onNavigate],
  );

  // Preload neighbours only.
  useEffect(() => {
    if (!open) return;
    preload(images[nextIndex(current, count)]?.src);
    preload(images[prevIndex(current, count)]?.src);
  }, [open, current, count, images]);

  // Keyboard handling.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, goNext, goPrev]);

  // Scroll lock (compensate scrollbar to avoid layout jump) + focus mgmt.
  useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const scrollBarWidth = window.innerWidth - documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (scrollBarWidth > 0) body.style.paddingRight = `${scrollBarWidth}px`;

    // Move focus into the dialog.
    closeBtnRef.current?.focus();

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      // Restore focus to the triggering thumbnail.
      restoreFocusTo?.focus?.();
    };
  }, [open, restoreFocusTo]);

  // Simple focus trap: keep Tab within the dialog.
  const onKeyDownTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'button, [href], [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // Touch swipe via pointer events.
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = pointerStart.current;
      pointerStart.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) goNext();
        else goPrev();
      }
    },
    [goNext, goPrev],
  );

  if (!open || !active) return null;

  return (
    <div
      ref={dialogRef}
      className="np-pg-lb"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onKeyDown={onKeyDownTrap}
      onClick={(e) => {
        // Click on the backdrop (not the image) closes.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="np-pg-lb__bar">
        {showCount && count > 1 && (
          <span className="np-pg-lb__count" aria-live="polite">
            {current + 1} / {count}
          </span>
        )}
        <button
          ref={closeBtnRef}
          type="button"
          className="np-pg-lb__btn np-pg-lb__close"
          onClick={onClose}
          aria-label="Close viewer"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {count > 1 && (
        <button
          type="button"
          className="np-pg-lb__btn np-pg-lb__nav np-pg-lb__prev"
          onClick={goPrev}
          aria-label="Previous photo"
        >
          <span aria-hidden="true">‹</span>
        </button>
      )}

      <figure
        className="np-pg-lb__stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <img
          className="np-pg-lb__img"
          src={active.src}
          alt={active.alt}
          width={active.w ?? undefined}
          height={active.h ?? undefined}
          decoding="async"
        />
        {active.caption && (
          <figcaption className="np-pg-lb__cap">{active.caption}</figcaption>
        )}
      </figure>

      {count > 1 && (
        <button
          type="button"
          className="np-pg-lb__btn np-pg-lb__nav np-pg-lb__next"
          onClick={goNext}
          aria-label="Next photo"
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}
