"use client";

// A card that wraps a rendered Mermaid diagram with a title, description, and
// actions (Copy Mermaid, View source, Download SVG). Fits the existing
// ChatGPT-style message bubbles.

import { useState } from "react";
import MermaidRenderer from "./MermaidRenderer";
import type { MermaidDiagram } from "./types";
import { copyText } from "../../lib/clipboard";

function sanitizeFilename(s: string): string {
  return (s || "diagram").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

function downloadSvg(id: string, filename: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const svg = new XMLSerializer().serializeToString(el);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function DiagramCard({
  diagram,
  id,
}: {
  diagram: MermaidDiagram;
  id: string;
}) {
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (await copyText(diagram.code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/60 overflow-hidden mt-2 max-w-full">
      {diagram.title && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {diagram.title}
          </p>
          {diagram.description && (
            <p className="text-xs text-zinc-500 mt-0.5">{diagram.description}</p>
          )}
        </div>
      )}

      <div className="px-3 sm:px-4">
        <MermaidRenderer code={diagram.code} id={id} />
      </div>

      <div className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          onClick={handleCopy}
          className="px-2 py-1 text-[11px] rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
        >
          {copied ? "✓ Copied" : "Copy Mermaid"}
        </button>
        <button
          type="button"
          onClick={() => setShowSource((s) => !s)}
          className="px-2 py-1 text-[11px] rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
        >
          View source
        </button>
        <button
          type="button"
          onClick={() => downloadSvg(id, sanitizeFilename(diagram.title ?? "diagram"))}
          className="px-2 py-1 text-[11px] rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
        >
          Download SVG
        </button>
      </div>

      {showSource && (
        <pre className="px-4 pb-3 pt-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap break-words border-t border-zinc-200/80 dark:border-zinc-800/80">
          {diagram.code}
        </pre>
      )}
    </div>
  );
}
