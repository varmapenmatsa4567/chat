"use client";

import { useState } from "react";
import { collection, addDoc, deleteDoc, doc } from "firebase/firestore";
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

export default function GptManager({ user, gpts, activeGptId, onSelect }: Props) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");

  async function createGpt() {
    const trimmed = name.trim();
    if (!trimmed || !db) return;
    const ref = await addDoc(collection(db, `users/${user.uid}/gpts`), {
      name: trimmed,
      instructions: instructions.trim(),
      createdAt: Date.now(),
    });
    onSelect(ref.id);
    setName("");
    setInstructions("");
  }

  async function deleteGpt(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, `users/${user.uid}/gpts/${id}`));
    if (activeGptId === id) onSelect(DEFAULT_GPT.id);
  }

  const allGpts = [DEFAULT_GPT, ...gpts];

  return (
    <div className="px-2 py-3 space-y-3">
      <div>
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Custom GPTs
        </p>
        <div className="space-y-0.5">
          {allGpts.map((g) => (
            <div key={g.id} className="group flex items-center">
              <button
                onClick={() => onSelect(g.id)}
                className={`flex-1 text-left px-2 py-1.5 rounded-lg text-sm truncate transition-colors ${
                  activeGptId === g.id
                    ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                    : "hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {g.name}
              </button>
              {g.id !== DEFAULT_GPT.id && (
                <button
                  onClick={() => deleteGpt(g.id)}
                  className="ml-1 p-1 rounded hover:text-red-500 text-zinc-400 transition-colors"
                  title="Delete GPT"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 space-y-2">
        <p className="px-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Create new GPT
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="GPT name"
          className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
        />
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="System instructions"
          rows={3}
          className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400 resize-none"
        />
        <button
          onClick={createGpt}
          disabled={!name.trim()}
          className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm disabled:opacity-30"
        >
          Create GPT
        </button>
      </div>
    </div>
  );
}
