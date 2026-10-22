import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";
import { canAccessAdmin } from "@nextpress/core/auth/permissions";
import { getPermissionSummary, checkPermission } from "@/lib/permissions/check";
import type { PermissionSlug } from "@nextpress/core/auth/auth-types";
import { AdminProviders } from "@/components/admin/shell/admin-providers";
import { Sidebar } from "@/components/admin/shell/sidebar";
import { Topbar } from "@/components/admin/shell/topbar";

/**
 * Admin Layout — server component shell.
 *
 * 1. Verifies auth + admin access (redirects if denied)
 * 2. Builds permission-gated navigation items
 * 3. Wraps children in client provider boundary (AdminProviders)
 * 4. Renders sidebar (client) + topbar (client) + content area
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const accessResult = canAccessAdmin(auth);
  if (!accessResult.granted) redirect("/login?error=unauthorized");

  const perms = await getPermissionSummary();

  // Build nav items based on permissions.
  // `icon` is a string name resolved to a component inside the client
  // Sidebar — component references cannot cross the server boundary.
  const navItems = [
    { href: "/admin", label: "Dashboard", icon: "dashboard" },
    { href: "/admin/posts", label: "Posts", icon: "posts" },
  ];

  if (perms.canUploadMedia) {
    navItems.push({ href: "/admin/media", label: "Media", icon: "media" });
  }
  if (perms.canModerateComments) {
    navItems.push({ href: "/admin/comments", label: "Comments", icon: "comments" });
  }

  // Instagram sits with the content tools rather than buried under Plugins:
  // it is a day-to-day destination (archive, sync, publish), not a plugin
  // management screen. Gated on the plugin's own read permission.
  if (await checkPermission("instagram_read" as PermissionSlug)) {
    navItems.push({
      href: "/admin/plugins/instagram-post",
      label: "Instagram",
      icon: "instagram",
    });
  }

  if (perms.canManageUsers) {
    navItems.push({ href: "/admin/users", label: "Users", icon: "users" });
  }
  if (perms.canManageAppearance) {
    navItems.push(
      { href: "/admin/menus", label: "Menus", icon: "menus" },
      { href: "/admin/appearance/themes", label: "Themes", icon: "themes" },
    );
  }
  if (perms.canManagePlugins) {
    navItems.push({ href: "/admin/plugins", label: "Plugins", icon: "plugins" });
  }
  if (perms.canManageSettings) {
    navItems.push(
      { href: "/admin/content-types", label: "Content Types", icon: "content-types" },
      { href: "/admin/taxonomies", label: "Taxonomies", icon: "taxonomies" },
      { href: "/admin/settings", label: "Settings", icon: "settings" },
    );
  }
  navItems.push({ href: "/admin/profile", label: "Profile", icon: "profile" });

  return (
    <AdminProviders>
      <div className="flex h-screen bg-gray-50">
        <Sidebar items={navItems} />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </AdminProviders>
  );
}
