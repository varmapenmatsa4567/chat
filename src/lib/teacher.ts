// Teacher Lesson shared spec + validator.
//
// The agent produces a structured TeacherLesson (title + steps). Each step is a
// NARRATION plus Mermaid source code that the browser renders as a diagram.
// Keeping the types + Zod validators here lets the server tool and the client
// share a single source of truth (mirrors src/lib/diagram.ts).
//
// Mermaid is rendered client-side by MermaidRenderer using a strict,
// non-executing security config, so untrusted model output is never injected
// as raw HTML.

import { z } from "zod";

export const teacherStepSchema = z.object({
  id: z.string().min(1, "Step id is required"),
  title: z.string().min(1, "Step title is required"),
  narration: z.string().min(1, "Step narration is required"),
  // Mermaid source code that declares its own diagram type (e.g. a header line
  // like "flowchart TD" or "sequenceDiagram"), rendered by the client.
  mermaid: z.string().min(1, "Step mermaid code is required"),
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

// Validate a single model-generated step. Never trusts the model: Zod enforces
// structure and non-empty fields; Mermaid is rendered safely client-side.
export function parseTeacherStep(input: unknown): TeacherStepParseResult {
  const parsed = teacherStepSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? ` (${first.path.join(".")})` : "";
    return { ok: false, error: `${first?.message ?? "Invalid step"}${where}` };
  }
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
  return { ok: true, lesson: parsed.data };
}
