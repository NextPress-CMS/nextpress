"use client";

/**
 * Section navigation for the Instagram admin area.
 *
 * The four screens (Overview, Import, Archive, Settings) are one destination,
 * so they share a persistent tab bar. Without it, each page looks like an
 * unrelated stop and the user loses their place after every navigation.
 *
 * Styling follows the existing settings nav: underline tabs, indigo accent.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, Images, LayoutDashboard, SlidersHorizontal } from "lucide-react";

const BASE = "/admin/plugins/instagram-post";

const TABS = [
  { href: BASE, label: "Overview", icon: LayoutDashboard },
  { href: `${BASE}/import`, label: "Import", icon: Download },
  { href: `${BASE}/posts`, label: "Archive", icon: Images },
  { href: `${BASE}/settings`, label: "Settings", icon: SlidersHorizontal },
] as const;

export function InstagramNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
      {TABS.map((tab) => {
        // Exact match only: the Overview route is a prefix of every other tab.
        const active = pathname === tab.href;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export default InstagramNav;
