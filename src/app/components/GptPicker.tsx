"use client";

import { useState, useEffect, useRef } from "react";
import type { CustomGpt } from "./GptManager";

export const DEFAULT_GPT: CustomGpt = {
  id: "default",
  name: "Default GPT",
  instructions: "",
};

type Props = {
  gpts: CustomGpt[];
  activeGptId: string;
  onSelect: (id: string) => void;
};

// Top-bar selector only — creation lives in the sidebar (GptManager).
export default function GptPicker({ gpts, activeGptId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const allGpts = [DEFAULT_GPT, ...gpts];
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
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors max-w-[160px] sm:max-w-[220px]"
        title="Change GPT"
      >
        <svg
          className="w-4 h-4 text-zinc-500 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 8V6a3 3 0 016 0v2M9 12h6" />
        </svg>
        <span className="text-sm truncate text-zinc-700 dark:text-zinc-300">
          {active.name}
        </span>
        <svg
          className="w-3 h-3 text-zinc-400 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 z-50 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-2">
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Custom GPTs
          </p>
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {allGpts.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  onSelect(g.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-sm truncate transition-colors ${
                  activeGptId === g.id
                    ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
          <p className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-700 px-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            Create GPTs in the sidebar.
          </p>
        </div>
      )}
    </div>
  );
}
