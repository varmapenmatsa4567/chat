// Shared Mermaid diagram specification + validator.
//
// The agent produces a structured MermaidDiagram (not rendered code); the
// frontend owns rendering. Keeping the type here lets both the server tool and
// the client renderer import a single source of truth.

export const DIAGRAM_TYPES = [
  "flowchart",
  "sequence",
  "class",
  "state",
  "er",
  "journey",
  "mindmap",
  "timeline",
  "architecture",
] as const;

export type MermaidDiagramType = (typeof DIAGRAM_TYPES)[number];

export type MermaidDiagram = {
  type: "diagram";
  diagramType: MermaidDiagramType;
  title?: string;
  description?: string;
  code: string;
};

export type ParseResult =
  | { ok: true; diagram: MermaidDiagram }
  | { ok: false; error: string };

// Validate arbitrary (model-generated) input as a MermaidDiagram. Never trusts
// the model: enforces a known diagramType and a non-empty code string.
export function parseMermaidDiagram(input: unknown): ParseResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Diagram must be an object" };
  }
  const o = input as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code.trim() : "";
  if (!code) {
    return { ok: false, error: "Diagram code is empty or missing" };
  }
  const diagramType = o.diagramType as MermaidDiagramType;
  if (!DIAGRAM_TYPES.includes(diagramType)) {
    return { ok: false, error: `Unknown diagram type: ${String(o.diagramType ?? "")}` };
  }
  return {
    ok: true,
    diagram: {
      type: "diagram",
      diagramType,
      title:
        typeof o.title === "string" && o.title.trim() ? o.title.trim() : undefined,
      description:
        typeof o.description === "string" && o.description.trim()
          ? o.description.trim()
          : undefined,
      code,
    },
  };
}
