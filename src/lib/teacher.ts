// Teacher Lesson shared spec + validator.
//
// The agent produces a structured TeacherLesson (title + steps). Each step is a
// NARRATION plus a complete, standalone SVG visualization that the browser
// renders directly. Keeping the types + Zod validators here lets the server
// tool and the client share a single source of truth (mirrors
// src/lib/diagram.ts).
//
// SVG is untrusted model output, so every step's SVG is sanitized before it is
// stored/rendered (see src/lib/svgSanitize.ts).

import { z } from "zod";
import { sanitizeSvg } from "./svgSanitize";

export const teacherStepSchema = z.object({
  id: z.string().min(1, "Step id is required"),
  title: z.string().min(1, "Step title is required"),
  narration: z.string().min(1, "Step narration is required"),
  // A complete standalone SVG markup string (browser-renderable).
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

export type TeacherStepParseResult =
  | { ok: true; step: TeacherStep }
  | { ok: false; error: string };

function sanitizeStepSvg(step: TeacherStep): string | null {
  const res = sanitizeSvg(step.svg);
  if (!res.ok) return res.error;
  step.svg = res.svg;
  return null;
}

// Validate a single model-generated step (used by the streaming add_step tool).
// Never trusts the model: Zod structural checks + sanitize the SVG.
export function parseTeacherStep(input: unknown): TeacherStepParseResult {
  const parsed = teacherStepSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? ` (${first.path.join(".")})` : "";
    return { ok: false, error: `${first?.message ?? "Invalid step"}${where}` };
  }
  const err = sanitizeStepSvg(parsed.data);
  if (err) return { ok: false, error: `Step SVG: ${err}` };
  return { ok: true, step: parsed.data };
}

// Validate arbitrary (model-generated) input as a full TeacherLesson. Used for
// reloading persisted lessons.
export function parseTeacherLesson(input: unknown): TeacherParseResult {
  const parsed = teacherLessonSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? ` (${first.path.join(".")})` : "";
    return { ok: false, error: `${first?.message ?? "Invalid lesson"}${where}` };
  }

  const lesson = parsed.data;
  for (const step of lesson.steps) {
    const err = sanitizeStepSvg(step);
    if (err) return { ok: false, error: `Step "${step.id}": ${err}` };
  }

  return { ok: true, lesson };
}
