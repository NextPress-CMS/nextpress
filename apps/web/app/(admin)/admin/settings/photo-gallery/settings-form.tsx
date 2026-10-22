"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, useToast } from "@nextpress/ui";
import { MediaPicker } from "@/components/admin/media/media-picker";
import type { MediaAssetDto } from "@nextpress/core/media/media-types";
import {
  parseSettings,
  createCollection,
  upsertCollection,
  removeCollection,
  setCollectionImages,
  type GallerySettings,
  type Collection,
} from "@nextpress/plugin-photo-gallery";
import {
  mediaAssetToGalleryImage,
  thumbSrc,
} from "@nextpress/plugin-photo-gallery/media";

const ENDPOINT = "/api/v1/plugins/photo-gallery/settings";

export function PhotoGallerySettingsForm() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<GallerySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    let active = true;
    fetch(ENDPOINT, { credentials: "include" })
      .then((r) => r.json())
      .then((raw: unknown) => {
        if (active) setSettings(parseSettings(raw as Record<string, unknown>));
      })
      .catch(() => {
        if (active) setSettings(parseSettings({}));
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(
    async (next: GallerySettings) => {
      setSettings(next);
      setSaving(true);
      try {
        const res = await fetch(ENDPOINT, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error("save failed");
        toast("success", "Settings saved");
      } catch {
        toast("error", "Could not save settings");
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  if (!settings) {
    return <p className="text-sm text-gray-400">Loading…</p>;
  }

  const setRenderMode = (mode: "server" | "client") =>
    void persist({ ...settings, renderMode: mode });

  const addCollection = () => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    void persist(upsertCollection(settings, createCollection(name)));
  };

  const deleteCollection = (id: string) =>
    void persist(removeCollection(settings, id));

  const addImageToCollection = (col: Collection, asset: MediaAssetDto) => {
    const gi = mediaAssetToGalleryImage(asset);
    if (!gi) return;
    const updated = setCollectionImages(col, [...col.images, gi]);
    void persist(upsertCollection(settings, updated));
  };

  const removeImage = (col: Collection, imageId: string) => {
    const updated = setCollectionImages(
      col,
      col.images.filter((i) => i.id !== imageId),
    );
    void persist(upsertCollection(settings, updated));
  };

  const activeCollection =
    pickerFor !== null
      ? settings.collections.find((c) => c.id === pickerFor) ?? null
      : null;

  return (
    <div className="space-y-8">
      {/* ── Render mode ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Default rendering
        </h2>
        <div className="flex gap-3">
          {(["server", "client"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRenderMode(mode)}
              className={`flex-1 rounded-lg border p-4 text-left transition ${
                settings.renderMode === mode
                  ? "border-accent ring-2 ring-accent"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="block font-medium capitalize">
                {mode === "server" ? "Server-side" : "Client-side"}
              </span>
              <span className="mt-1 block text-xs text-gray-500">
                {mode === "server"
                  ? "Best for SEO. Works without JavaScript."
                  : "Hydrates for interactivity."}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Individual galleries can override this in the block settings.
        </p>
      </section>

      {/* ── Collections ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Collections
        </h2>
        <p className="mb-3 text-xs text-gray-400">
          Reusable image sets. Create one, add images from your Media Library,
          then select it inside any gallery block.
        </p>

        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={newName}
            placeholder="New collection name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCollection()}
            className="flex-1 rounded-sm border border-gray-300 px-3 py-1.5 text-sm"
          />
          <Button onClick={addCollection} disabled={!newName.trim() || saving}>
            Create
          </Button>
        </div>

        {settings.collections.length === 0 ? (
          <p className="text-sm text-gray-400">No collections yet.</p>
        ) : (
          <ul className="space-y-4">
            {settings.collections.map((col) => (
              <li key={col.id} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-medium">{col.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {col.images.length} images
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPickerFor(col.id)}
                    >
                      Add images
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => deleteCollection(col.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {col.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {col.images.map((img) => (
                      <div key={img.id} className="group relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbSrc(img)}
                          alt={img.alt}
                          className="aspect-square w-full rounded-sm object-cover"
                        />
                        <button
                          type="button"
                          aria-label="Remove image"
                          onClick={() => removeImage(col, img.id)}
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 group-hover:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <MediaPicker
        open={pickerFor !== null}
        accept="image/*"
        onSelect={(asset) => {
          if (activeCollection) addImageToCollection(activeCollection, asset);
        }}
        onClose={() => setPickerFor(null)}
      />
    </div>
  );
}
