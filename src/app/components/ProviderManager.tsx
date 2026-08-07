"use client";

import { useState } from "react";
import { collection, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  KNOWN_PROVIDERS,
  providerDisplayName,
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

  function pickKnown(key: string) {
    setKnownKey(key);
    const k = KNOWN_PROVIDERS.find((p) => p.key === key);
    if (k) {
      setBaseURL(k.baseURL);
      // Suggest the provider's name as the label (editable).
      setLabel((prev) => (prev.trim() ? prev : k.name));
    }
  }

  async function addProvider() {
    if (!apiKey.trim() || !baseURL.trim() || !db) return;
    const known = KNOWN_PROVIDERS.find((k) => k.key === knownKey);
    const ref = await addDoc(collection(db, `users/${user.uid}/providers`), {
      label: label.trim() || known?.name || "Custom provider",
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      createdAt: Date.now(),
    });
    onSelect(ref.id);
    setApiKey("");
  }

  async function deleteProvider(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, `users/${user.uid}/providers/${id}`));
    if (activeProviderId === id) onSelect(null);
  }

  return (
    <div className="px-2 py-3 space-y-3">
      <div>
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          My providers
        </p>
        <div className="space-y-0.5">
          <button
            onClick={() => onSelect(null)}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm truncate transition-colors ${
              activeProviderId === null
                ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                : "hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Default provider
          </button>
          {providers.map((p) => (
            <div key={p.id} className="group flex items-center">
              <button
                onClick={() => onSelect(p.id)}
                className={`flex-1 text-left px-2 py-1.5 rounded-lg text-sm truncate transition-colors ${
                  activeProviderId === p.id
                    ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                    : "hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {providerDisplayName(p)}
              </button>
              <button
                onClick={() => deleteProvider(p.id)}
                className="ml-1 p-1 rounded hover:text-red-500 text-zinc-400 transition-colors"
                title="Delete provider"
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
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 space-y-2">
        <p className="px-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Add provider
        </p>
        <select
          value={knownKey}
          onChange={(e) => pickKnown(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
        >
          {KNOWN_PROVIDERS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.name}
            </option>
          ))}
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
        />
        <input
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          placeholder="Base URL"
          className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
        />
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key"
          type="password"
          className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
        />
        <button
          onClick={addProvider}
          disabled={!apiKey.trim() || !baseURL.trim()}
          className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm disabled:opacity-30"
        >
          Add provider
        </button>
      </div>
    </div>
  );
}
