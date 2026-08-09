"use client";

// Renders a Mermaid source string to an SVG in the browser using Mermaid's
// programmatic API. Client-only (Mermaid needs browser APIs) — the heavy import
// is dynamic and code-split. Mermaid code is treated as untrusted model output:
// we use a strict, non-executing config and only inject the SVG Mermaid itself
// generates (never arbitrary HTML).

import { useEffect, useRef, useState } from "react";

type Props = {
  code: string;
  id: string; // unique per rendered diagram, avoids Mermaid id collisions
};

function isDarkTheme(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

export default function MermaidRenderer({ code, id }: Props) {
  // Leaf container div: it has NO React children, so React never reconciles or
  // wipes the SVG we inject imperatively via innerHTML. The loading/error
  // overlays are siblings, not children, so they don't disturb it.
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setState("loading");
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: isDarkTheme() ? "dark" : "base",
        });
        if (cancelled || !containerRef.current) return;
        const { svg } = await mermaid.render(id, code);
        if (cancelled) return;
        if (!svg || !containerRef.current) {
          setState("error");
          return;
        }
        containerRef.current.innerHTML = svg;
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("Mermaid render failed", err);
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, id]);

  return (
    <div className="relative flex justify-center overflow-x-auto py-2 min-h-[40px]">
      <div ref={containerRef} className="flex justify-center" />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
          Rendering diagram…
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
          Unable to render this diagram.
        </div>
      )}
    </div>
  );
}
