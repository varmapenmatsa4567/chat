"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { providerDisplayName, type ProviderConfig } from "../../lib/providers";
import type { User } from "firebase/auth";

type Props = {
  user: User;
  providers: ProviderConfig[];
  activeProviderId: string | null;
  activeModel: string | null;
  onSelect: (providerId: string | null, model: string | null) => void;
};

// Top-bar selector only: pick a provider (added in the sidebar), then pick a
// model from that provider's catalogue.
export default function ProviderPicker({
  user,
  providers,
  activeProviderId,
  activeModel,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsFor, setModelsFor] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = providers.find((p) => p.id === activeProviderId) ?? null;

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

  // Load a provider's models (no auto-select; user picks explicitly).
  const loadModels = useCallback(async (provider: ProviderConfig) => {
    setModelsFor(provider.id);
    setLoadingModels(true);
    setModelsError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseURL: provider.baseURL,
          apiKey: provider.apiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load models");
      setModels(data.models ?? []);
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : "Failed to load models");
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  // Load models when the dropdown opens for the currently-active provider.
  useEffect(() => {
    if (open && active && modelsFor !== active.id) loadModels(active);
  }, [open, active, modelsFor, loadModels]);

  function pickProvider(id: string | null, model: string | null) {
    onSelect(id, model);
    if (id === null) {
      setModels([]);
      setModelsFor(null);
    }
  }

  return (
    <div ref={rootRef} className="relative flex-shrink-0 min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors max-w-[200px]"
        title="Change provider"
      >
        <svg
          className="w-4 h-4 text-zinc-500 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M3 12h18M3 19h18" />
        </svg>
        <span className="text-sm truncate text-zinc-700 dark:text-zinc-300">
          {active
            ? activeModel
              ? `${providerDisplayName(active)} · ${activeModel}`
              : providerDisplayName(active)
            : "Default provider"}
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
        <div className="absolute right-0 top-full mt-1 w-80 z-50 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-2">
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Provider
          </p>
          <button
            onClick={() => pickProvider(null, null)}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm truncate transition-colors ${
              activeProviderId === null
                ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Default provider
          </button>
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                pickProvider(p.id, null);
                loadModels(p);
              }}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-sm truncate transition-colors ${
                activeProviderId === p.id
                  ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {providerDisplayName(p)}
            </button>
          ))}

          {active && (
            <div className="mt-2 border-t border-zinc-200 dark:border-zinc-700 pt-2">
              <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Model
              </p>
              {loadingModels ? (
                <p className="px-2 text-sm text-zinc-400">Loading models…</p>
              ) : modelsError ? (
                <p className="px-2 text-[11px] text-red-500">{modelsError}</p>
              ) : models.length > 0 ? (
                <select
                  value={activeModel ?? ""}
                  onChange={(e) => onSelect(activeProviderId, e.target.value || null)}
                  className="w-full px-2 py-1.5 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
                >
                  {!activeModel && <option value="">Select a model…</option>}
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="px-2 text-[11px] text-zinc-400">
                  No models found. Check the provider's API key.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
