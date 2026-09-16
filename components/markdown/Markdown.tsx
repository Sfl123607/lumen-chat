"use client";
import { isValidElement, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock } from "@/components/markdown/CodeBlock";

/** Extracts plain text from a React node tree (used to get the raw code for copy). */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

const components: Components = {
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    let language: string | null = null;
    if (isValidElement<{ className?: string }>(child)) {
      const m = /language-([\w+#-]+)/.exec(child.props.className ?? "");
      language = m?.[1] ?? null;
    }
    const code = textOf(children).replace(/\n$/, "");
    return (
      <CodeBlock language={language} code={code}>
        <pre>{children}</pre>
      </CodeBlock>
    );
  },
  a({ href, children }) {
    // react-markdown already strips dangerous protocols; open external links safely.
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table>{children}</table>
      </div>
    );
  },
};

const remarkPlugins: NonNullable<Options["remarkPlugins"]> = [remarkGfm];
const rehypePlugins: NonNullable<Options["rehypePlugins"]> = [[rehypeHighlight, { detect: false }]];

/**
 * Safe Markdown renderer. Raw HTML in the source is never rendered
 * (react-markdown escapes it), so model output can't inject markup or scripts.
 */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
});
