"use client";

import { useState } from "react";
import { collection, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { User } from "firebase/auth";
import type { CustomGpt } from "../types";
import { PRESET_GPTS } from "./GptPicker";

const EMOJI_OPTIONS = ["🤖", "🧙‍♂️", "👩‍💻", "📊", "🎨", "🚀", "💡", "🩺", "⚖️", "📚"];

type Props = {
  user: User;
  gpts: CustomGpt[];
  activeGptId: string;
  onSelect: (id: string) => void;
};

export default function GptManager({ user, gpts, activeGptId, onSelect }: Props) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("🤖");
  const [saving, setSaving] = useState(false);

  async function createGpt() {
    const trimmed = name.trim();
    if (!trimmed || !db) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, `users/${user.uid}/gpts`), {
        name: trimmed,
        instructions: instructions.trim(),
        description: description.trim(),
        icon,
        createdAt: Date.now(),
      });
      onSelect(ref.id);
      setName("");
      setInstructions("");
      setDescription("");
    } catch (err) {
      console.error("Failed to create GPT", err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteGpt(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, `users/${user.uid}/gpts/${id}`));
    if (activeGptId === id) onSelect(PRESET_GPTS[0].id);
  }

  return (
    <div className="p-3 space-y-5">
      {/* Preset Personas */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1 pb-2">
          Curated Personas
        </p>
        <div className="space-y-1">
          {PRESET_GPTS.map((g) => {
            const isSelected = activeGptId === g.id;
            return (
              <button
                key={g.id}
                onClick={() => onSelect(g.id)}
                className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between border ${
                  isSelected
                    ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500/30 text-indigo-950 dark:text-indigo-200"
                    : "border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base">{g.icon}</span>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{g.name}</p>
                    <p className="text-[10px] text-zinc-400 truncate">{g.description}</p>
                  </div>
                </div>
                {isSelected && (
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold text-xs">Active</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* User Custom GPTs */}
      {gpts.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1 pb-2">
            My Custom GPTs ({gpts.length})
          </p>
          <div className="space-y-1.5">
            {gpts.map((g) => {
              const isSelected = activeGptId === g.id;
              return (
                <div
                  key={g.id}
                  className={`group flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                    isSelected
                      ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500/30 text-indigo-950 dark:text-indigo-200"
                      : "border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <button
                    onClick={() => onSelect(g.id)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <span className="text-base">{g.icon ?? "🎭"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{g.name}</p>
                      <p className="text-[10px] text-zinc-400 truncate">
                        {g.description || g.instructions || "Custom instructions"}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {isSelected && (
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold text-xs mr-1">Active</span>
                    )}
                    <button
                      onClick={() => deleteGpt(g.id)}
                      className="p-1 rounded-lg hover:bg-rose-500/10 hover:text-rose-500 text-zinc-400 transition-colors opacity-80 group-hover:opacity-100"
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create New Custom GPT */}
      <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1">
          Create Custom GPT
        </p>

        <div className="space-y-2.5">
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Avatar Icon</label>
            <div className="flex gap-1.5 flex-wrap">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center transition-all ${
                    icon === e
                      ? "bg-indigo-600 text-white ring-2 ring-indigo-500/40"
                      : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">GPT Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Next.js Expert"
              className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Short Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Specialized in Next.js App Router"
              className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">System Instructions</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="You are an expert developer with deep knowledge of..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 resize-none leading-relaxed"
            />
          </div>

          <button
            onClick={createGpt}
            disabled={!name.trim() || saving}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-1.5"
          >
            {saving ? "Creating…" : "+ Create GPT"}
          </button>
        </div>
      </div>
    </div>
  );
}
