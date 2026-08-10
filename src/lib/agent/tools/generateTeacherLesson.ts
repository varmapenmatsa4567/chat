// generate_teacher_lesson tool — the agent calls this in AI Teacher Mode to
// produce a full, step-by-step visual lesson. It validates the structured spec
// (via Zod + SVG sanitization) and emits it to the client; the frontend owns
// rendering and TTS playback. The agent never knows about React/SVG/DOM.

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
          "Create a complete step-by-step visual lesson that teaches a topic like a teacher on a whiteboard. Each step is a standalone SVG visualization plus narration text that will be spoken aloud. Use this whenever the user wants to learn or be taught a topic step by step. Do NOT paste lesson content into the chat; always call this tool and return the full structured lesson.",
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
                "4-10 steps that progress logically from simple to advanced. Each step introduces or modifies ONE idea. Every step MUST contain its own complete, standalone SVG (viewBox 0 0 800 500 recommended) representing the whiteboard state at that exact point, and narration (1-3 sentences) describing exactly what the learner should notice in that SVG. Keep consistent visual positions across steps when showing the same objects; use highlights, arrows, labels, and faded elements to communicate changes. The narration and SVG must correspond to each other — never reference an element that is not in the SVG.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique step id, e.g. 'step-1'." },
                  title: { type: "string", description: "Short title for this step." },
                  narration: {
                    type: "string",
                    description: "Natural narration that can be spoken aloud, 1-3 sentences.",
                  },
                  svg: {
                    type: "string",
                    description:
                      "Complete standalone SVG markup string. Must begin with <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 800 500\"> and contain only SVG primitives (rect, circle, ellipse, line, polyline, polygon, path, text, g). No scripts, no external URLs, no images, no event handlers.",
                  },
                  duration: {
                    type: "number",
                    description: "Optional minimum display time in seconds for this step.",
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
