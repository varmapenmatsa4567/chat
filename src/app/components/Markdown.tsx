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

// Wraps a <pre> block with a header (language label + copy button) and sleek styling.
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
    <div className="group !my-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden bg-zinc-950 shadow-md">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-b border-zinc-800 text-zinc-400">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 opacity-60">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-xs font-mono font-medium lowercase tracking-wider pl-1.5 text-zinc-400">
            {language ?? "code"}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="text-xs font-medium px-2.5 py-1 rounded-lg
                     bg-zinc-800 hover:bg-zinc-700 text-zinc-300
                     border border-zinc-700/60 transition-all flex items-center gap-1.5"
          title="Copy code"
        >
          {copied ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <svg
                className="w-3.5 h-3.5"
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
              Copied!
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-zinc-300 hover:text-white">
              <svg
                className="w-3.5 h-3.5"
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
        className="p-4 overflow-x-auto text-zinc-100 text-[13.5px] leading-relaxed font-mono"
      >
        {children}
      </pre>
    </div>
  );
}

export default function Markdown({ content }: MarkdownProps) {
  return (
    <div className="markdown-body leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 dark:text-indigo-400 font-medium underline decoration-indigo-400/40 dark:decoration-indigo-600 underline-offset-4 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
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
                className="rounded-md bg-zinc-200/70 dark:bg-zinc-800 px-1.5 py-0.5 text-[0.875em] font-mono text-indigo-600 dark:text-indigo-300 font-semibold"
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
