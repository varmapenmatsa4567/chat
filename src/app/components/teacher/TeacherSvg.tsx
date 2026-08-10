"use client";

// Renders a single teacher-step SVG as a "whiteboard". The SVG is untrusted
// model output, so it is sanitized twice: once structurally on the server
// (during lesson validation) and again here with DOMPurify before injection.

import { useMemo } from "react";
import DOMPurify from "dompurify";

export default function TeacherSvg({ svg }: { svg: string }) {
  // DOMPurify needs a DOM; during SSR we fall back to the already-server-scrubbed
  // string (no scripts reach the HTML before hydration, and sanitize runs on
  // the client). USE_PROFILES.svg keeps only safe SVG tags/attributes.
  const safe = useMemo(() => {
    if (typeof window === "undefined") return svg;
    return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
  }, [svg]);

  if (!safe || !safe.trim()) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-zinc-400">
        Unable to display this step.
      </div>
    );
  }

  // The whiteboard stays a light surface in both themes so black text/strokes
  // read clearly; the surrounding card still adapts to dark mode.
  return (
    <div className="w-full rounded-xl bg-white border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <div
        className="teacher-svg w-full [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    </div>
  );
}
