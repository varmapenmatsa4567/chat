// Teacher Mode tools. The agent builds a lesson incrementally so each step can
// stream to the client as soon as it is produced (no waiting for the whole
// lesson). Two tools:
//   - start_teacher_lesson  (title + optional intro)
//   - add_teacher_step      (one validated step with a real standalone SVG)
// Each step carries complete, hand-authored SVG markup that the browser renders
// directly, so the visuals look deliberate rather than auto-generated.

import type { AgentTool, AgentStreamEvent } from "../types";
import { parseTeacherStep } from "../../teacher";

export function createStartTeacherLessonTool(
  emit: (evt: AgentStreamEvent) => void
): AgentTool {
  return {
    definition: {
      type: "function",
      function: {
        name: "start_teacher_lesson",
        description:
          "Start an AI Teacher lesson. Call this FIRST with the lesson title (and an optional spoken introduction) before adding any steps. Do not paste lesson content into the chat.",
        parameters: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Short title of the lesson, e.g. 'Binary Search'.",
            },
            introduction: {
              type: "string",
              description: "Optional 1-2 sentence spoken intro before step 1.",
            },
          },
          required: ["title"],
          additionalProperties: false,
        },
      },
    },
    run: async (args) => {
      const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : "Lesson";
      const introduction =
        typeof args.introduction === "string" && args.introduction.trim()
          ? args.introduction.trim()
          : undefined;
      emit({ type: "teacher_lesson_start", title, introduction });
      return JSON.stringify({ success: true, title });
    },
  };
}

export function createAddTeacherStepTool(
  emit: (evt: AgentStreamEvent) => void
): AgentTool {
  return {
    definition: {
      type: "function",
      function: {
        name: "add_teacher_step",
        description:
          "Add one step to the current AI Teacher lesson. Call once per step, in order, and keep adding steps until the entire topic is fully explained — never stop early. Each step needs: a short id and title, natural 1-3 sentence narration that can be spoken aloud, and a complete standalone SVG string representing the whiteboard state at that exact step. Write real SVG markup (rect, circle, line, polyline, polygon, path, text, g) using the SAME viewBox of 0 0 800 500 on every step so all steps render at the same size. The narration must describe exactly what is shown in the SVG, and the SVG must show exactly what the narration describes. Keep the same objects in the same positions across steps, using colors, opacity, highlights, arrows, and faded or crossed-out elements to communicate what changed. Do not paste lesson content into the chat.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique step id, e.g. 'step-1'." },
            title: { type: "string", description: "Short title for this step." },
            narration: {
              type: "string",
              description: "Natural narration to speak aloud, 1-3 sentences describing what the learner should notice in this step's SVG.",
            },
            duration: {
              type: "number",
              description: "Optional minimum display time in seconds for this step.",
            },
            svg: {
              type: "string",
              description:
                "A complete, standalone SVG markup string. Must begin with <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 800 500\"> and use only SVG primitives (rect, circle, ellipse, line, polyline, polygon, path, text, g). No scripts, no event handlers, no images, no external URLs, no iframes or objects. Prefer readable, focused diagrams; do not generate enormous SVGs with thousands of elements.",
            },
          },
          required: ["id", "title", "narration", "svg"],
          additionalProperties: false,
        },
      },
    },
    run: async (args) => {
      const parsed = parseTeacherStep(args);
      if (!parsed.ok) {
        return JSON.stringify({ success: false, error: parsed.error });
      }
      // Stream this step to the client immediately.
      emit({ type: "teacher_step", step: parsed.step });
      return JSON.stringify({ success: true, id: parsed.step.id });
    },
  };
}
