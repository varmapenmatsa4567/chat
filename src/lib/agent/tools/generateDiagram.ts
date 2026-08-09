// generate_diagram tool — the agent calls this when a visual (Mermaid) diagram
// materially improves an answer. It validates the structured spec and emits it
// to the client; rendering is entirely the frontend's job (the agent never
// knows about React/SVG/DOM).

import type { AgentTool, AgentStreamEvent } from "../types";
import { DIAGRAM_TYPES, parseMermaidDiagram } from "../../diagram";

export function createDiagramTool(
  emit: (evt: AgentStreamEvent) => void
): AgentTool {
  return {
    definition: {
      type: "function",
      function: {
        name: "generate_diagram",
        description:
          "Create a Mermaid diagram to visually explain a concept when relationships, flow, sequence, architecture, hierarchy, or interaction materially improve the answer. Use for: workflows/flowcharts (login process, algorithms, decision trees), sequence diagrams (API requests, service-to-service calls), ER diagrams (database relationships), class diagrams (OOP), state diagrams (state machines), mindmaps, timelines, and architecture diagrams. Do NOT use for simple factual questions that a normal text answer handles fine.",
        parameters: {
          type: "object",
          properties: {
            diagramType: {
              type: "string",
              enum: [...DIAGRAM_TYPES],
              description:
                "The kind of diagram: flowchart, sequence, class, state, er, journey, mindmap, timeline, architecture.",
            },
            title: {
              type: "string",
              description: "Short title for the diagram (optional).",
            },
            description: {
              type: "string",
              description: "One-line explanation of what the diagram shows (optional).",
            },
            code: {
              type: "string",
              description:
                "Valid Mermaid source code, e.g. flowchart TD\\n  A --> B",
            },
          },
          required: ["diagramType", "code"],
          additionalProperties: false,
        },
      },
    },
    run: async (args) => {
      const parsed = parseMermaidDiagram({
        type: "diagram",
        diagramType: args.diagramType,
        title: args.title,
        description: args.description,
        code: args.code,
      });
      if (!parsed.ok) {
        return JSON.stringify({ success: false, error: parsed.error });
      }
      // Surface the diagram to the chat UI for rendering.
      emit({ type: "diagram", diagram: parsed.diagram });
      // Return the structured spec to the model so it knows it succeeded.
      return JSON.stringify({ success: true, ...parsed.diagram });
    },
  };
}
