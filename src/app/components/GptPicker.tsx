"use client";

import { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { User } from "firebase/auth";

export type CustomGpt = {
  id: string;
  name: string;
  instructions: string;
};

export const DEFAULT_GPT: CustomGpt = {
  id: "default",
  name: "Default GPT",
  instructions: "",
};

type Props = {
  user: User;
  gpts: CustomGpt[];
  activeGptId: string;
  onSelect: (id: string) => void;
};

export default function GptPicker({
  user,
  gpts,
  activeGptId,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const allGpts = [DEFAULT_GPT, ...gpts];
  const active = allGpts.find((g) => g.id === activeGptId) ?? DEFAULT_GPT;

  // Close the dropdown on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function createGpt() {
    const trimmedName = name.trim();
    if (!trimmedName || !db) return;
    const ref = await addDoc(collection(db, `users/${user.uid}/gpts`), {
      name: trimmedName,
      instructions: instructions.trim(),
      createdAt: Date.now(),
    });
    onSelect(ref.id);
    setName("");
    setInstructions("");
    setCreating(false);
    setOpen(false);
  }

  async function deleteGpt(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, `users/${user.uid}/gpts/${id}`));
    if (activeGptId === id) onSelect(DEFAULT_GPT.id);
  }

  return (
    <div ref={rootRef} className="relative flex-shrink-0 min-w-0">
      {/* Trigger */}
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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 8V6a3 3 0 016 0v2M9 12h6"
          />
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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 z-50 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-2">
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Custom GPTs
          </p>

          {/* GPT list */}
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {allGpts.map((g) => (
              <div key={g.id} className="group flex items-center">
                <button
                  onClick={() => {
                    onSelect(g.id);
                    setOpen(false);
                  }}
                  className={`flex-1 text-left px-2 py-1.5 rounded-lg text-sm truncate transition-colors ${
                    activeGptId === g.id
                      ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {g.name}
                </button>
                {g.id !== DEFAULT_GPT.id && (
                  <button
                    onClick={() => deleteGpt(g.id)}
                    className="ml-1 p-1 rounded hover:text-red-500 text-zinc-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    title="Delete GPT"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {creating ? (
            <div className="mt-2 border-t border-zinc-200 dark:border-zinc-700 pt-2 space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="GPT name"
                className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
              />
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="System instructions (what this GPT should do / be)"
                rows={3}
                className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400 resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={createGpt}
                  disabled={!name.trim()}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm disabled:opacity-30"
                >
                  Create
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="px-3 py-1.5 rounded-lg text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700 pt-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New GPT
            </button>
          )}
        </div>
      )}
    </div>
  );
}
