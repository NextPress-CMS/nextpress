import type { JSX } from "react";
import { z } from "zod";
import DOMPurify from "isomorphic-dompurify";
import { registerBlock } from "../registry";
import type { BlockRenderProps } from "../types";

export const headingSchema = z.object({
  content: z.string().default(""),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).default(2),
  align: z.enum(["left", "center", "right"]).optional(),
  anchor: z.string().optional(),
});

export type HeadingAttributes = z.infer<typeof headingSchema>;

function HeadingBlock({ attributes, className }: BlockRenderProps<HeadingAttributes>) {
  const Tag = `h${attributes.level}` as keyof JSX.IntrinsicElements;
  const style: React.CSSProperties = {};
  if (attributes.align) style.textAlign = attributes.align;

  return (
    <Tag
      id={attributes.anchor || undefined}
      className={className}
      style={style}
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(attributes.content, {
          ALLOWED_TAGS: ["strong", "em", "a", "code", "mark"],
          ALLOWED_ATTR: ["href", "target", "rel"],
        }),
      }}
    />
  );
}

registerBlock({
  type: "core/heading",
  title: "Heading",
  description: "Section heading (H1–H6)",
  icon: "heading",
  category: "text",
  keywords: ["heading", "title", "h1", "h2", "h3"],
  attributesSchema: headingSchema,
  defaultAttributes: { content: "", level: 2 },
  version: 1,
  allowsInnerBlocks: false,
  source: "core",
  renderComponent: HeadingBlock,
});
