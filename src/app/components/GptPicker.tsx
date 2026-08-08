"use client";

import { useState, useEffect, useRef } from "react";
import type { CustomGpt } from "../types";

export const PRESET_GPTS: CustomGpt[] = [
  {
    id: "default",
    name: "Standard AI",
    instructions: "",
    icon: "✨",
    description: "Helpful, balanced general-purpose assistant.",
    isPreset: true,
  },
  {
    id: "coder",
    name: "Senior Architect",
    instructions: "You are an elite Staff Software Engineer. Write clean, production-grade, bug-free, and well-typed code. Explain architecture clearly and provide concise explanations.",
    icon: "💻",
    description: "Expert in full-stack architecture, TypeScript, algorithms and debugging.",
    isPreset: true,
  },
  {
    id: "writer",
    name: "Creative Writer",
    instructions: "You are a master creative writer and editor. Craft captivating, eloquent, evocative prose with rich vocabulary and flawless pacing.",
    icon: "✍️",
    description: "Essays, copywriting, storytelling and articulate prose.",
    isPreset: true,
  },
  {
    id: "researcher",
    name: "Deep Researcher",
    instructions: "You are an academic researcher. Analyze topics with deep rigor, structured evidence, balanced perspectives, and logical clarity.",
    icon: "🔬",
    description: "In-depth factual breakdowns, scientific reasoning, and structured analysis.",
    isPreset: true,
  },
  {
    id: "concise",
    name: "Concise Summarizer",
    instructions: "You provide ultra-concise, high-density, bulleted answers. No filler, no pleasantries, only direct signal.",
    icon: "⚡",
    description: "Zero fluff, laser-focused direct answers.",
    isPreset: true,
  },
];

export const DEFAULT_GPT: CustomGpt = PRESET_GPTS[0];

type Props = {
  gpts: CustomGpt[];
  activeGptId: string;
  onSelect: (id: string) => void;
};

export default function GptPicker({ gpts, activeGptId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const allGpts = [...PRESET_GPTS, ...gpts];
  const active = allGpts.find((g) => g.id === activeGptId) ?? DEFAULT_GPT;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-shrink-0 min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800/90 transition-all text-xs font-medium max-w-[160px] sm:max-w-[220px]"
        title="Switch Persona / Custom GPT"
      >
        <span className="text-sm">{active.icon ?? "🎭"}</span>
        <span className="text-zinc-900 dark:text-zinc-100 font-semibold truncate">
          {active.name}
        </span>
        <svg
          className="w-3.5 h-3.5 text-zinc-400 ml-auto flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-3 animate-message space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              AI Persona & Mode
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
            {allGpts.map((g) => {
              const isSelected = activeGptId === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    onSelect(g.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? "bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-500/30 text-indigo-900 dark:text-indigo-200"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <span className="text-base mt-0.5">{g.icon ?? "🎭"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold truncate">{g.name}</span>
                      {isSelected && (
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
                      )}
                    </div>
                    {g.description && (
                      <p className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5">
                        {g.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 px-1">
            <p className="text-[11px] text-zinc-400 text-center">
              Create and manage personas in the sidebar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
