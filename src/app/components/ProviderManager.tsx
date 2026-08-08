"use client";

import { useState } from "react";
import { collection, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  KNOWN_PROVIDERS,
  providerDisplayName,
  getProviderIcon,
  type ProviderConfig,
} from "../../lib/providers";
import type { User } from "firebase/auth";

type Props = {
  user: User;
  providers: ProviderConfig[];
  activeProviderId: string | null;
  onSelect: (id: string | null) => void;
};

export default function ProviderManager({
  user,
  providers,
  activeProviderId,
  onSelect,
}: Props) {
  const [knownKey, setKnownKey] = useState(KNOWN_PROVIDERS[0].key);
  const [label, setLabel] = useState("");
  const [baseURL, setBaseURL] = useState(KNOWN_PROVIDERS[0].baseURL);
  const [apiKey, setApiKey] = useState("");
  const [adding, setAdding] = useState(false);

  function pickKnown(key: string) {
    setKnownKey(key);
    const k = KNOWN_PROVIDERS.find((p) => p.key === key);
    if (k) {
      setBaseURL(k.baseURL);
      setLabel(k.name);
    }
  }

  async function addProvider() {
    if (!apiKey.trim() || !baseURL.trim() || !db) return;
    setAdding(true);
    try {
      const known = KNOWN_PROVIDERS.find((k) => k.key === knownKey);
      const ref = await addDoc(collection(db, `users/${user.uid}/providers`), {
        label: label.trim() || known?.name || "Custom Provider",
        baseURL: baseURL.trim(),
        apiKey: apiKey.trim(),
        createdAt: Date.now(),
      });
      onSelect(ref.id);
      setApiKey("");
      setLabel("");
    } catch (err) {
      console.error("Failed to add provider", err);
    } finally {
      setAdding(false);
    }
  }

  async function deleteProvider(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, `users/${user.uid}/providers/${id}`));
    if (activeProviderId === id) onSelect(null);
  }

  return (
    <div className="p-3 space-y-5">
      {/* Existing saved providers */}
      <div>
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Configured Providers
          </p>
          <span className="text-[10px] text-zinc-400">
            {providers.length + 1} Available
          </span>
        </div>

        <div className="space-y-1.5">
          {/* Default provider */}
          <button
            onClick={() => onSelect(null)}
            className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between border ${
              activeProviderId === null
                ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500/30 text-indigo-950 dark:text-indigo-200"
                : "border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-base">🍃</span>
              <div className="min-w-0">
                <p className="font-semibold truncate">Default Free Tier</p>
                <p className="text-[10px] text-zinc-400 truncate">Opencode Zen (mimo-v2.5-free)</p>
              </div>
            </div>
            {activeProviderId === null && (
              <span className="text-indigo-600 dark:text-indigo-400 font-bold text-xs">Active</span>
            )}
          </button>

          {/* User providers */}
          {providers.map((p) => {
            const isSelected = activeProviderId === p.id;
            return (
              <div
                key={p.id}
                className={`group flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                  isSelected
                    ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500/30 text-indigo-950 dark:text-indigo-200"
                    : "border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <button
                  onClick={() => onSelect(p.id)}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                >
                  <span className="text-base">{getProviderIcon(p.baseURL)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{providerDisplayName(p)}</p>
                    <p className="text-[10px] text-zinc-400 truncate">{p.baseURL}</p>
                  </div>
                </button>

                <div className="flex items-center gap-1.5">
                  {isSelected && (
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold text-xs mr-1">Active</span>
                  )}
                  <button
                    onClick={() => deleteProvider(p.id)}
                    className="p-1 rounded-lg hover:bg-rose-500/10 hover:text-rose-500 text-zinc-400 transition-colors opacity-80 group-hover:opacity-100"
                    title="Remove Provider"
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

      {/* Add new provider section */}
      <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1">
          Connect New Provider
        </p>

        <div className="space-y-2">
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Provider Type</label>
            <select
              value={knownKey}
              onChange={(e) => pickKnown(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100"
            >
              {KNOWN_PROVIDERS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.icon} {k.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Custom Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Work OpenAI Account"
              className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Base URL</label>
            <input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 font-mono text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">API Key</label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              type="password"
              className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 font-mono text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <button
            onClick={addProvider}
            disabled={!apiKey.trim() || !baseURL.trim() || adding}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-1.5"
          >
            {adding ? "Connecting…" : "+ Connect Provider"}
          </button>
        </div>
      </div>
    </div>
  );
}
