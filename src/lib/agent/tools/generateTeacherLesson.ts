// generate_teacher_lesson tool — used in AI Teacher Mode to produce a complete,
// step-by-step visual lesson in ONE structured call.
//
// The whole lesson is generated in a single tool call (rather than one call per
// step) so the model plans and writes the entire step list up front. This is
// reliable and complete — it avoids the many rapid sequential API requests that
// a per-step approach triggers (which caused rate-limit 429 errors) and it
// guarantees the lesson isn't truncated partway. The tradeoff is the steps are
// not streamed one-by-one; the full validated lesson is emitted at once.
//
// Each step carries complete, hand-authored SVG markup that the browser renders
// directly, so the visuals look deliberate rather than auto-generated.

import type { AgentTool, AgentStreamEvent } from "../types";
import { parseTeacherLesson } from "../../teacher";

export function createTeacherLessonTool(
  emit: (evt: AgentStreamEvent) => void
): AgentTool {
  return {
    definition: {
      type: "function",
      function: {
        name: "generate_teacher_lesson",
        description:
          "Create a COMPLETE, step-by-step visual lesson that teaches a topic like a teacher on a whiteboard, covering the entire topic from start to finish. Call this ONCE and include ALL steps. Each step is a standalone SVG visualization plus narration that will be spoken aloud. Do NOT stop early — include every step needed to fully explain the topic (generally 4-10 steps). Do NOT paste lesson content into the chat; always return the full structured lesson through this tool.",
        parameters: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Short title of the lesson, e.g. 'Binary Search'.",
            },
            introduction: {
              type: "string",
              description: "Optional one- or two-sentence spoken intro before step 1.",
            },
            steps: {
              type: "array",
              description:
                "ALL the steps of the lesson, in order, covering the topic completely. Each step introduces or modifies ONE idea and has its own standalone SVG plus narration. The narration (1-3 sentences) must describe exactly what is shown in the step's SVG, and the SVG must show exactly what the narration describes. Keep the same objects in the same positions across steps, using highlights, arrows, labels, and faded/crossed-out elements to communicate changes.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique step id, e.g. 'step-1'." },
                  title: { type: "string", description: "Short title for this step." },
                  narration: {
                    type: "string",
                    description: "Natural narration to speak aloud, 1-3 sentences.",
                  },
                  duration: {
                    type: "number",
                    description: "Optional minimum display time in seconds.",
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
            conclusion: {
              type: "string",
              description: "Optional closing summary spoken after the final step.",
            },
          },
          required: ["title", "steps"],
          additionalProperties: true,
        },
      },
    },
    run: async (args) => {
      const parsed = parseTeacherLesson(args);
      if (!parsed.ok) {
        return JSON.stringify({ success: false, error: parsed.error });
      }
      // Surface the validated lesson to the chat UI for playback.
      emit({ type: "teacher_lesson", lesson: parsed.lesson });
      // Return the structured spec to the model so it knows it succeeded.
      return JSON.stringify({
        success: true,
        title: parsed.lesson.title,
        stepCount: parsed.lesson.steps.length,
      });
    },
  };
}
