/**
 * Instagram permissions.
 *
 * Declared in plugin.json and extended into the core `PermissionMap` by module
 * augmentation, so `can(auth, "instagram_publish")` is checked at compile time
 * rather than by matching a string.
 *
 * ENFORCEMENT IS SERVER-SIDE. These constants gate route handlers and service
 * calls. Hiding a button is presentation, never protection.
 */

// Augment the module that actually declares PermissionMap. The core package
// re-exports the type, but augmentation must target its declaring module.
declare module "@nextpress/core/auth/auth-types" {
  interface PermissionMap {
    instagram_read: true;
    instagram_import: true;
    instagram_publish: true;
    instagram_manage_connection: true;
    instagram_manage_settings: true;
  }
}

export const INSTAGRAM_PERMISSIONS = {
  /** View the dashboard, archive and sync status. */
  read: "instagram_read",
  /** Run historical imports and manual synchronisation. */
  import: "instagram_import",
  /** Publish NextPress content to Instagram. */
  publish: "instagram_publish",
  /** Connect, reconnect, disconnect the account. */
  manageConnection: "instagram_manage_connection",
  /** Change plugin settings. */
  manageSettings: "instagram_manage_settings",
} as const;

export type InstagramPermission =
  (typeof INSTAGRAM_PERMISSIONS)[keyof typeof INSTAGRAM_PERMISSIONS];

/**
 * Suggested role mapping for installers.
 *
 * Connection management is deliberately administrator-only: it controls a
 * credential and can repoint the site at a different Instagram account.
 */
export const SUGGESTED_ROLE_PERMISSIONS: Record<string, InstagramPermission[]> = {
  administrator: [
    INSTAGRAM_PERMISSIONS.read,
    INSTAGRAM_PERMISSIONS.import,
    INSTAGRAM_PERMISSIONS.publish,
    INSTAGRAM_PERMISSIONS.manageConnection,
    INSTAGRAM_PERMISSIONS.manageSettings,
  ],
  editor: [
    INSTAGRAM_PERMISSIONS.read,
    INSTAGRAM_PERMISSIONS.import,
    INSTAGRAM_PERMISSIONS.publish,
  ],
  author: [INSTAGRAM_PERMISSIONS.read],
  contributor: [INSTAGRAM_PERMISSIONS.read],
};
