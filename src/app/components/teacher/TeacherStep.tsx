"use client";

// One teaching step: the Mermaid diagram (with a subtle fade/scale transition
// keyed on the step id so it remounts on change) plus the narration bubble and
// a tap-to-rehear button.

import MermaidRenderer from "../diagrams/MermaidRenderer";
import type { TeacherStep as TeacherStepData } from "../../../lib/teacher";

export default function TeacherStep({
  step,
  onHear,
  isSpeaking,
}: {
  step: TeacherStepData;
  onHear: () => void;
  isSpeaking: boolean;
}) {
  return (
    <div className="space-y-3">
      <div
        key={step.id}
        className="teacher-step-enter w-full rounded-xl bg-white border border-zinc-200 dark:border-zinc-700 overflow-hidden px-2 py-2"
      >
        <MermaidRenderer code={step.mermaid} id={`teacher-${step.id}`} />
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/80 px-3 py-2.5">
        <button
          type="button"
          onClick={onHear}
          disabled={isSpeaking}
          title={isSpeaking ? "Speaking…" : "Hear this step"}
          className="flex-shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
        >
          {isSpeaking ? "⏳" : "🔊"}
        </button>
        <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
          {step.narration}
        </p>
      </div>
    </div>
  );
}
