"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  FileText,
  Image as ImageIcon,
  Instagram,
  LayoutDashboard,
  ListTree,
  MessageSquare,
  Palette,
  Plug,
  SlidersHorizontal,
  Settings,
  Shapes,
  Tags,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon?: string;
}

/**
 * Icon registry.
 *
 * The nav is built in a SERVER component, so items can only carry a string
 * name — a component reference is not serialisable across that boundary.
 * Resolving the name here keeps the icons in the client bundle where they
 * belong, and an unknown name simply renders no icon rather than crashing.
 */
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  posts: FileText,
  media: ImageIcon,
  comments: MessageSquare,
  users: Users,
  menus: ListTree,
  themes: Palette,
  customize: SlidersHorizontal,
  plugins: Plug,
  instagram: Instagram,
  "content-types": Shapes,
  taxonomies: Tags,
  settings: Settings,
  profile: UserCircle,
  reading: BookOpen,
};

interface SidebarProps {
  items: NavItem[];
  siteName?: string;
}

export function Sidebar({ items, siteName }: SidebarProps) {
  const pathname = usePathname();

  /**
   * Resolve the single active item by LONGEST matching href.
   *
   * A plain `startsWith` test lights up every ancestor: on
   * /admin/plugins/instagram-post both "Plugins" and "Instagram" would appear
   * active. Picking the most specific match keeps exactly one item highlighted.
   */
  const activeHref = items.reduce<string | null>((best, item) => {
    const matches =
      item.href === "/admin"
        ? pathname === "/admin"
        : pathname === item.href || pathname.startsWith(`${item.href}/`);

    if (!matches) return best;
    return best === null || item.href.length > best.length ? item.href : best;
  }, null);

  return (
    <aside className="w-60 shrink-0 border-r bg-gray-50 flex flex-col h-screen overflow-y-auto">
      {/* Brand */}
      <div className="px-4 py-4 border-b">
        <Link href="/admin" className="text-lg font-bold text-gray-900">
          {siteName ?? "NextPress"}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {items.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon ? ICONS[item.icon] : undefined;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-150 ${
                isActive
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {/* Active rail: a quiet anchor for the eye when scanning the list */}
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-600 transition-opacity duration-150 ${
                  isActive ? "opacity-100" : "opacity-0"
                }`}
              />
              {Icon && (
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600"
                  }`}
                />
              )}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t text-xs text-gray-400">
        <Link href="/" className="hover:text-gray-600">
          View site →
        </Link>
      </div>
    </aside>
  );
}
