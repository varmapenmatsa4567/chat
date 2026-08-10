// Teacher Lesson shared spec + validator.
//
// The agent produces a structured TeacherLesson (title + steps, each step = a
// standalone SVG + narration to speak aloud); the frontend owns playback and
// rendering. Keeping the types and validator here lets both the server tool
// and the client player import a single source of truth (mirrors
// src/lib/diagram.ts).

import { z } from "zod";
import { sanitizeSvg } from "./svgSanitize";

export const teacherStepSchema = z.object({
  id: z.string().min(1, "Step id is required"),
  title: z.string().min(1, "Step title is required"),
  narration: z.string().min(1, "Step narration is required"),
  svg: z.string().min(1, "Step svg is required"),
  duration: z.number().optional(),
});

export const teacherLessonSchema = z.object({
  title: z.string().min(1, "Lesson title is required"),
  introduction: z.string().optional(),
  steps: z
    .array(teacherStepSchema)
    .min(1, "A lesson must have at least one step")
    .max(20, "A lesson cannot exceed 20 steps"),
  conclusion: z.string().optional(),
});

export type TeacherStep = z.infer<typeof teacherStepSchema>;
export type TeacherLesson = z.infer<typeof teacherLessonSchema>;

export type TeacherParseResult =
  | { ok: true; lesson: TeacherLesson }
  | { ok: false; error: string };

// Validate arbitrary (model-generated) input as a TeacherLesson and sanitize
// every SVG. Never trusts the model: structural checks via Zod, plus each
// step's SVG must pass the sanitizer (untrusted markup → reject the lesson).
export function parseTeacherLesson(input: unknown): TeacherParseResult {
  const parsed = teacherLessonSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? ` (${first.path.join(".")})` : "";
    return { ok: false, error: `${first?.message ?? "Invalid lesson"}${where}` };
  }

  const lesson = parsed.data;

  // Sanitize each step's SVG; reject the whole lesson on any failure.
  for (const step of lesson.steps) {
    const res = sanitizeSvg(step.svg);
    if (!res.ok) {
      return { ok: false, error: `Step "${step.id}" SVG: ${res.error}` };
    }
    step.svg = res.svg;
  }

  return { ok: true, lesson };
}
