"use client";

import { useState, useEffect, useRef } from "react";

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  action: () => void;
  shortcut?: string;
}

interface CommandMenuProps {
  items: CommandItem[];
}

export function CommandMenu({ items }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) { inputRef.current?.focus(); setQuery(""); }
  }, [open]);

  if (!open) return null;

  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/30" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command..."
          className="w-full px-4 py-3 border-b text-sm outline-hidden"
        />
        <div className="max-h-64 overflow-y-auto py-2">
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => { item.action(); setOpen(false); }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{item.label}</div>
                {item.description && <div className="text-gray-400 text-xs">{item.description}</div>}
              </div>
              {item.shortcut && <kbd className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-sm">{item.shortcut}</kbd>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">No commands found</p>
          )}
        </div>
      </div>
    </div>
  );
}
