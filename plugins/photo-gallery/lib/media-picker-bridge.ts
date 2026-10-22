"use client";

import type { ComponentType } from "react";
import type { MediaAssetDto } from "@nextpress/core/media/media-types";

/**
 * Media-picker dependency injection.
 *
 * The gallery editor needs the admin app's Media Library picker, but the
 * plugin must stay free of `apps/web` internals so it can be published as a
 * standalone package. The app injects its picker component here at editor
 * bootstrap; the gallery editor consumes whatever was provided.
 */

export interface MediaPickerProps {
  open: boolean;
  onSelect: (asset: MediaAssetDto) => void;
  onClose: () => void;
  accept?: string;
}

export type MediaPickerComponent = ComponentType<MediaPickerProps>;

let injectedPicker: MediaPickerComponent | null = null;

/** Called once by the host app to supply its Media Library picker. */
export function setMediaPicker(picker: MediaPickerComponent): void {
  injectedPicker = picker;
}

/** Returns the injected picker, or null if the host has not provided one. */
export function getMediaPicker(): MediaPickerComponent | null {
  return injectedPicker;
}
