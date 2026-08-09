"use client";

// Live, in-browser preview of a project the agent built in the VFS, using
// @codesandbox/sandpack-react. Only renders for recognized React / Vite / Next
// projects; otherwise it returns null. Includes a header with collapse toggle.

import { useState, useMemo } from "react";
import { Sandpack } from "@codesandbox/sandpack-react";
import type { SandpackPredefinedTemplate } from "@codesandbox/sandpack-react";

type Vfs = { files?: Record<string, string>; dirs?: string[] } | null;

type Template = "react" | "vite" | "nextjs" | "vanilla";

function detectTemplate(files: Record<string, string>): Template {
  const keys = Object.keys(files);
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
  try {
    pkg = JSON.parse(files["package.json"] || "{}");
  } catch {
    pkg = {};
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  if (deps.next || keys.some((k) => k.startsWith("next.config"))) return "nextjs";
  if (
    files["index.html"] &&
    ["src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js"].some((k) => files[k])
  ) {
    return "vite";
  }
  if (
    deps.react ||
    deps["react-dom"] ||
    keys.some((k) => /^(src\/)?App\.(tsx|jsx|js|ts)$/.test(k))
  ) {
    return "react";
  }
  return "vanilla";
}

// Map VFS paths (no leading slash) to Sandpack file keys (leading slash). For
// the "react" template we also alias common CRA entries (src/index.* -> /index,
// src/App.* -> /App) so the template's expected entry files resolve.
function buildSandpackFiles(files: Record<string, string>, template: Template): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [p, code] of Object.entries(files)) {
    out["/" + p] = code;
  }

  if (template === "react") {
    const index =
      files["src/index.tsx"] ??
      files["src/index.jsx"] ??
      files["src/index.js"] ??
      files["src/index.ts"];
    const app =
      files["src/App.tsx"] ??
      files["src/App.jsx"] ??
      files["src/App.js"] ??
      files["App.tsx"] ??
      files["App.js"];
    if (index && !out["/index.js"]) out["/index.js"] = index;
    if (app && !out["/App.js"]) out["/App.js"] = app;
  }

  return out;
}

export default function ProjectPreview({
  vfs,
  height = 420,
}: {
  vfs: Vfs;
  height?: number;
}) {
  const [open, setOpen] = useState(true);
  const files = vfs?.files;

  const { template, sandpackFiles, hasProject } = useMemo(() => {
    if (!files || Object.keys(files).length === 0) {
      return { template: "vanilla" as Template, sandpackFiles: {} as Record<string, string>, hasProject: false };
    }
    const t = detectTemplate(files);
    return { template: t, sandpackFiles: buildSandpackFiles(files, t), hasProject: t !== "vanilla" };
  }, [files]);

  if (!hasProject || Object.keys(sandpackFiles).length === 0) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 12l3.5-3.5A4.5 4.5 0 0112 4.5v2m7.75 5.5l-3.5 3.5a4.5 4.5 0 01-6.25 0L8.25 13.5" />
          </svg>
          Live Preview
          <span className="font-medium uppercase tracking-wide text-[10px] text-zinc-400 dark:text-zinc-500">
            {template}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <Sandpack
          template={template as SandpackPredefinedTemplate}
          files={sandpackFiles}
          options={{
            editorHeight: height,
            autorun: true,
            autoReload: false,
            initMode: "user-visible",
          }}
          theme="dark"
        />
      )}
    </div>
  );
}
