"use client";

import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { copyText } from "../lib/clipboard";

type MarkdownProps = {
  content: string;
};

// Pull the `language-*` class off the <code> element inside a <pre>.
function getCodeLanguage(node: unknown): string | undefined {
  const children = (node as { children?: { tagName?: string }[] } | undefined)
    ?.children;
  const codeNode = children?.find((c) => c.tagName === "code") as
    | { properties?: { className?: string | string[] } }
    | undefined;
  const className = codeNode?.properties?.className;
  const list = Array.isArray(className)
    ? className
    : className
      ? [className]
      : [];
  return list.find((c) => c.startsWith("language-"))?.replace("language-", "");
}

// Wraps a <pre> block with a header (language label + copy button) and padding.
function CodeBlock({
  language,
  children,
}: {
  language?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  async function handleCopy() {
    const text = preRef.current?.textContent ?? "";
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="group !my-3 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-950 dark:bg-[#0d1117]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.05] border-b border-white/10">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          {language ?? "code"}
        </span>
        <button
          onClick={handleCopy}
          className="text-[11px] font-medium px-2 py-0.5 rounded-md
                     bg-white/10 hover:bg-white/20 text-zinc-300
                     border border-white/15 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Copied
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 5H6a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M8 5a2 2 0 002 2h4a2 2 0 002-2M8 5a2 2 0 012-2h4a2 2 0 012 2"
                />
              </svg>
              Copy
            </span>
          )}
        </button>
      </div>
      <pre
        ref={preRef}
        className="p-4 overflow-x-auto text-zinc-100 text-[13px]"
      >
        {children}
      </pre>
    </div>
  );
}

// ChatGPT-style markdown renderer with GFM (tables, strikethrough) and
// syntax-highlighted code blocks (theme imported in globals.css).
export default function Markdown({ content }: MarkdownProps) {
  return (
    <div className="markdown-body text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline decoration-blue-300 dark:decoration-blue-700 underline-offset-2 hover:text-blue-500"
            />
          ),
          code: ({ node, className, children, ...props }) => {
            const isBlock = className && className.includes("language-");
            if (isBlock) {
              return (
                <code
                  className={`${className ?? ""} block overflow-x-auto`}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-black/[0.06] dark:bg-white/[0.1] px-1.5 py-0.5 text-[0.9em] font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ node, children }) => (
            <CodeBlock language={getCodeLanguage(node)}>{children}</CodeBlock>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
