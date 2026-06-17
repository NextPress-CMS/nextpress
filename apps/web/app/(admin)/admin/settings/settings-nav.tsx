"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, BookOpen, MessageSquare, Link2, Image } from "lucide-react";

const tabs = [
  { href: "/admin/settings/general",    label: "General",    icon: Settings },
  { href: "/admin/settings/reading",    label: "Reading",    icon: BookOpen },
  { href: "/admin/settings/discussion", label: "Discussion", icon: MessageSquare },
  { href: "/admin/settings/permalinks", label: "Permalinks", icon: Link2 },
  { href: "/admin/settings/media",      label: "Media",      icon: Image },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`
              flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
              ${active
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
