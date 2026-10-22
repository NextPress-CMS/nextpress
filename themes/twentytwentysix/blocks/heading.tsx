import type { JSX } from "react";
import DOMPurify from "isomorphic-dompurify";
import type { BlockRenderProps } from "@nextpress/blocks";

/**
 * Twenty Twentysix heading — auto-generates anchor IDs for
 * table of contents linking.
 */
export default function ThemedHeading({ attributes, className }: BlockRenderProps) {
  const content = attributes.content as string;
  if (!content) return null;

  const level = (attributes.level as number) ?? 2;
  const align = attributes.align as string | undefined;
  const anchor = attributes.anchor as string | undefined;

  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  const autoAnchor = anchor ?? slugify(content.replace(/<[^>]*>/g, ""));

  return (
    <Tag
      id={autoAnchor}
      className={className}
      style={align ? { textAlign: align as any } : undefined}
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(content, {
          ALLOWED_TAGS: ["strong", "em", "a", "code", "mark"],
          ALLOWED_ATTR: ["href", "target", "rel"],
        }),
      }}
    />
  );
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
