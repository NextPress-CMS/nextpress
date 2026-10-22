"use client";

import { useEffect, useState } from "react";
import type { BlockEditProps } from "@nextpress/blocks";
import type { MediaAssetDto } from "@nextpress/core/media/media-types";
import { Button, EmptyState } from "@nextpress/ui";
// The Media Library picker is injected by the host app (see media-picker-bridge)
// so this plugin stays free of apps/web internals and can ship standalone.
import { getMediaPicker } from "../lib/media-picker-bridge";
import {
  GALLERY_LAYOUTS,
  GALLERY_COLUMNS,
  GALLERY_GAP,
  GALLERY_RADIUS,
  GALLERY_ASPECT,
  GALLERY_HOVER,
  GALLERY_CAPTION_MODE,
} from "../lib/schema";
import type {
  PhotoGalleryAttributes,
  GalleryImage,
  GalleryLayout,
  GalleryColumns,
  GalleryGap,
  GalleryRadius,
  GalleryAspect,
  GalleryHover,
  GalleryCaptionMode,
  GalleryRenderChoice,
  GalleryRenderMode,
} from "../lib/schema";
import { parseSettings } from "../lib/collections";
import type { Collection } from "../lib/collections";
import { mediaAssetToGalleryImage, thumbSrc } from "../lib/media";
import { reorder } from "../lib/layouts";

const SELECT_CLASS =
  "np-input w-full rounded border border-gray-300 px-2 py-1 text-sm";

function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
      {props.label}
      <select
        className={SELECT_CLASS}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
      >
        {props.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): React.ReactElement {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  );
}

export default function PhotoGalleryEditor({
  attributes,
  setAttributes,
  isSelected,
}: BlockEditProps<PhotoGalleryAttributes>): React.ReactElement {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  // Site-wide plugin settings (render default + available collections), fetched
  // once on mount. Falls back to safe defaults if the request fails.
  const [siteRenderMode, setSiteRenderMode] =
    useState<GalleryRenderMode>("server");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/v1/plugins/photo-gallery/settings", {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw: unknown = await res.json();
        // Narrow defensively via the shared parser (unknown → typed settings).
        const parsed = parseSettings(
          typeof raw === "object" && raw !== null
            ? (raw as Record<string, unknown>)
            : {},
        );
        if (!active) return;
        setSiteRenderMode(parsed.renderMode);
        setCollections(parsed.collections);
      } catch {
        if (!active) return;
        setSiteRenderMode("server");
        setCollections([]);
      } finally {
        if (active) setSettingsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const MediaPicker = getMediaPicker();
  const images = attributes.images;

  const selectedCollection =
    collections.find((c) => c.id === attributes.collectionId) ?? null;

  const onSelectCollection = (id: string): void => {
    if (!id) {
      // "This block only" — detach from any collection, keep current images.
      setAttributes({ collectionId: "" });
      return;
    }
    const col = collections.find((c) => c.id === id);
    if (!col) {
      setAttributes({ collectionId: id });
      return;
    }
    // Copy the collection's images into the block as a self-contained snapshot.
    setAttributes({ collectionId: id, images: col.images });
  };

  const appendAsset = (asset: MediaAssetDto): void => {
    const gi = mediaAssetToGalleryImage(asset);
    if (gi) setAttributes({ images: [...images, gi] });
  };

  const removeAt = (index: number): void => {
    setAttributes({ images: images.filter((_, i) => i !== index) });
  };

  const move = (from: number, to: number): void => {
    if (to < 0 || to >= images.length) return;
    setAttributes({ images: reorder(images, from, to) });
  };

  const updateImage = (index: number, patch: Partial<GalleryImage>): void => {
    const next = images.map((img, i) =>
      i === index ? { ...img, ...patch } : img,
    );
    setAttributes({ images: next });
  };

  const handleDrop = (to: number): void => {
    if (dragFrom === null) return;
    move(dragFrom, to);
    setDragFrom(null);
  };

  return (
    <div className="np-pg-editor rounded border-2 border-dashed border-gray-300 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">🖼️</span>
        <span className="font-medium">Photo Gallery</span>
        <span className="text-xs text-gray-400">{images.length} images</span>
      </div>

      {/* Source: select an existing collection (managed in Settings) or keep
          this block's own ad-hoc image set. */}
      <div className="mb-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Source
          <select
            className={SELECT_CLASS}
            value={attributes.collectionId}
            disabled={!settingsLoaded}
            onChange={(e) => onSelectCollection(e.target.value)}
          >
            <option value="">This block only</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {selectedCollection ? (
          <p className="mt-1 text-xs text-gray-500">
            Using collection &lsquo;{selectedCollection.name}&rsquo;. Edits here
            affect this block only; manage collections in Settings → Photo
            Gallery.
          </p>
        ) : collections.length === 0 && settingsLoaded ? (
          <p className="mt-1 text-xs text-gray-400">
            No saved collections yet. Create reusable collections in Settings →
            Photo Gallery.
          </p>
        ) : null}
      </div>

      {images.length === 0 ? (
        <EmptyState
          title="Add photos"
          description="Create a gallery using images from your Media Library."
          action={
            <div className="flex items-center justify-center gap-2">
              <Button onClick={() => setPickerOpen(true)}>Select Images</Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((image, index) => (
              <div
                key={image.id}
                draggable
                onDragStart={(e) => {
                  setDragFrom(index);
                  e.dataTransfer.setData("text/plain", String(index));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(index);
                }}
                className="flex flex-col gap-1 rounded border border-gray-200 bg-white p-1"
              >
                <div className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbSrc(image)}
                    alt={image.alt}
                    className="aspect-square w-full rounded object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => removeAt(index)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                  >
                    ×
                  </button>
                  <div className="absolute bottom-1 left-1 flex gap-1">
                    <button
                      type="button"
                      aria-label="Move left"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      aria-label="Move right"
                      disabled={index === images.length - 1}
                      onClick={() => move(index, index + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white disabled:opacity-30"
                    >
                      ›
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={image.caption ?? ""}
                  placeholder="Caption"
                  onChange={(e) =>
                    updateImage(index, { caption: e.target.value })
                  }
                  className="np-input w-full rounded border border-gray-200 px-1 py-0.5 text-xs"
                />
                <input
                  type="text"
                  value={image.alt}
                  placeholder="Alt text"
                  onChange={(e) => updateImage(index, { alt: e.target.value })}
                  className="np-input w-full rounded border border-gray-200 px-1 py-0.5 text-xs"
                />
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              Add more
            </Button>
            <span className="text-xs text-gray-400">
              Add images one at a time from your library.
            </span>
          </div>
        </>
      )}

      {isSelected && (
        <div className="mt-4 space-y-4 border-t pt-4">
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Layout
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <SelectField<GalleryLayout>
                label="Layout"
                value={attributes.layout}
                options={GALLERY_LAYOUTS}
                onChange={(layout) => setAttributes({ layout })}
              />
              <SelectField<GalleryColumns>
                label="Columns"
                value={attributes.columns}
                options={GALLERY_COLUMNS}
                onChange={(columns) => setAttributes({ columns })}
              />
              <SelectField<GalleryGap>
                label="Gap"
                value={attributes.gap}
                options={GALLERY_GAP}
                onChange={(gap) => setAttributes({ gap })}
              />
              <SelectField<GalleryRadius>
                label="Radius"
                value={attributes.radius}
                options={GALLERY_RADIUS}
                onChange={(radius) => setAttributes({ radius })}
              />
              <SelectField<GalleryAspect>
                label="Aspect ratio"
                value={attributes.aspectRatio}
                options={GALLERY_ASPECT}
                onChange={(aspectRatio) => setAttributes({ aspectRatio })}
              />
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Rendering
            </h4>
            {/* Resolution rule: the public dispatcher switches to the client
                renderer ONLY when the STORED value is exactly "client".
                "default" and "server" both render server-side. So picking
                "Site default" while the global is "client" still stores
                "default" and renders server — an accepted tradeoff (the global
                "client" default is conceptual, not baked at edit time here). */}
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Rendering
              <select
                className={SELECT_CLASS}
                value={attributes.renderMode}
                onChange={(e) =>
                  setAttributes({
                    renderMode: e.target.value as GalleryRenderChoice,
                  })
                }
              >
                <option value="default">
                  Site default ({siteRenderMode})
                </option>
                <option value="server">Server-side</option>
                <option value="client">Client-side</option>
              </select>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Server-side is best for SEO and works without JavaScript.
              Client-side hydrates for interactivity.
            </p>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Appearance
            </h4>
            <SelectField<GalleryHover>
              label="Hover effect"
              value={attributes.hoverEffect}
              options={GALLERY_HOVER}
              onChange={(hoverEffect) => setAttributes({ hoverEffect })}
            />
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Lightbox
            </h4>
            <CheckboxField
              label="Enable lightbox"
              checked={attributes.lightbox}
              onChange={(lightbox) => setAttributes({ lightbox })}
            />
            <CheckboxField
              label="Show image count"
              checked={attributes.showImageCount}
              onChange={(showImageCount) => setAttributes({ showImageCount })}
            />
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Captions
            </h4>
            <CheckboxField
              label="Show captions"
              checked={attributes.showCaptions}
              onChange={(showCaptions) => setAttributes({ showCaptions })}
            />
            <SelectField<GalleryCaptionMode>
              label="Caption mode"
              value={attributes.captionMode}
              options={GALLERY_CAPTION_MODE}
              onChange={(captionMode) => setAttributes({ captionMode })}
            />
          </section>
        </div>
      )}

      {MediaPicker && (
        <MediaPicker
          open={pickerOpen}
          accept="image/*"
          onSelect={appendAsset}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
