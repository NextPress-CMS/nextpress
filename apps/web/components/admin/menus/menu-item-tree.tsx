"use client";

import { useState } from "react";
import type { MenuItemDto } from "@nextpress/core/menu/menu-types";

interface Props {
  items: MenuItemDto[];
  onUpdate: (items: MenuItemDto[]) => void;
  depth?: number;
}

/**
 * Draggable, nestable menu item tree.
 * Handles reordering, editing labels, removing items, and nesting.
 */
export function MenuItemTree({ items, onUpdate, depth = 0 }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  function moveItem(index: number, direction: "up" | "down") {
    const newItems = [...items];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= newItems.length) return;
    [newItems[index], newItems[target]] = [newItems[target]!, newItems[index]!];
    onUpdate(newItems);
  }

  function removeItem(index: number) {
    onUpdate(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, updates: Partial<MenuItemDto>) {
    onUpdate(items.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  }

  function updateChildren(index: number, newChildren: MenuItemDto[]) {
    onUpdate(
      items.map((item, i) => (i === index ? { ...item, children: newChildren } : item)),
    );
  }

  function indentItem(index: number) {
    if (index === 0) return;
    const item = items[index]!;
    const prevItem = items[index - 1]!;
    const newItems = items.filter((_, i) => i !== index);
    newItems[index - 1] = {
      ...prevItem,
      children: [...(prevItem.children ?? []), { ...item, parentId: prevItem.id }],
    };
    onUpdate(newItems);
  }

  return (
    <div className="space-y-1" style={{ marginLeft: depth > 0 ? "1.5rem" : 0 }}>
      {items.map((item, index) => (
        <div key={item.id}>
          <div className="flex items-center gap-2 rounded-sm border bg-gray-50 px-3 py-2 text-sm group">
            {/* Drag handle */}
            <span className="text-gray-300 cursor-grab">⠿</span>

            {/* Label (editable) */}
            {editingId === item.id ? (
              <input
                type="text"
                value={item.label}
                onChange={(e) => updateItem(index, { label: e.target.value })}
                onBlur={() => setEditingId(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                className="np-input flex-1 text-sm py-1"
                autoFocus
              />
            ) : (
              <span
                className="flex-1 cursor-pointer"
                onClick={() => setEditingId(item.id)}
              >
                {item.label}
                <span className="text-xs text-gray-400 ml-2">
                  {item.type === "custom" ? item.url : item.type}
                </span>
              </span>
            )}

            {/* Actions */}
            <div className="hidden group-hover:flex items-center gap-1">
              <button onClick={() => moveItem(index, "up")} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Move up">↑</button>
              <button onClick={() => moveItem(index, "down")} disabled={index === items.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Move down">↓</button>
              {depth === 0 && index > 0 && (
                <button onClick={() => indentItem(index)} className="text-gray-400 hover:text-gray-600" title="Make sub-item">→</button>
              )}
              <button onClick={() => removeItem(index)} className="text-red-400 hover:text-red-600" title="Remove">✕</button>
            </div>
          </div>

          {/* Nested children */}
          {item.children && item.children.length > 0 && (
            <MenuItemTree
              items={item.children}
              onUpdate={(newChildren) => updateChildren(index, newChildren)}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
}
