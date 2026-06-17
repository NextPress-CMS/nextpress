import { z } from "zod";
import DOMPurify from "isomorphic-dompurify";
import { registerBlock } from "../registry";
import type { BlockRenderProps } from "../types";

/**
 * core/html — A rich HTML block.
 *
 * Stores sanitized HTML produced by a WYSIWYG editor (TipTap, etc).
 * Allows the common rich-text element set: headings, lists, blockquotes,
 * code, links, images, alignment classes, and basic inline styles.
 *
 * Sanitization runs on every render, so even if a stored payload is
 * tampered with, the rendered output stays inside the allowed tag set.
 */

export const htmlSchema = z.object({
  content: z.string().default(""),
});

export type HtmlAttributes = z.infer<typeof htmlSchema>;

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "del", "mark", "sub", "sup",
  "a", "code", "pre", "kbd", "blockquote",
  "ul", "ol", "li",
  "img", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
  "span", "div",
];

const ALLOWED_ATTR = [
  "href", "target", "rel", "title",
  "src", "alt", "width", "height", "loading",
  "class", "style", "id",
  "colspan", "rowspan",
];

function HtmlBlock({ attributes, className }: BlockRenderProps<HtmlAttributes>) {
  if (!attributes.content) return null;
  return (
    <div
      className={`${className ?? ""} np-rich-content`.trim()}
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(attributes.content, {
          ALLOWED_TAGS,
          ALLOWED_ATTR,
        }),
      }}
    />
  );
}

registerBlock({
  type: "core/html",
  title: "Rich HTML",
  description: "A rich-text HTML block produced by the WYSIWYG editor",
  icon: "code",
  category: "text",
  keywords: ["html", "rich", "wysiwyg", "text"],
  attributesSchema: htmlSchema,
  defaultAttributes: { content: "" },
  version: 1,
  allowsInnerBlocks: false,
  source: "core",
  renderComponent: HtmlBlock,
});
