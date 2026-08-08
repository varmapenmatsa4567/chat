"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  activeModel: string | null;
  onSelect: (providerId: string | null, model: string | null) => void;
};

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
  const [searchQuery, setSearchQuery] = useState("");
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

  // Load a provider's models dynamically
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
      // Fallback: check if it's a known provider with popular models preset
      const known = KNOWN_PROVIDERS.find((k) => k.baseURL === provider.baseURL);
      if (known?.popularModels) {
        setModels(known.popularModels);
      } else {
        setModels([]);
      }
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (open && active && modelsFor !== active.id) {
      loadModels(active);
    }
  }, [open, active, modelsFor, loadModels]);

  function pickProvider(id: string | null, model: string | null) {
    onSelect(id, model);
    if (id === null) {
      setModels([]);
      setModelsFor(null);
    }
  }

  const currentIcon = active ? getProviderIcon(active.baseURL) : "🍃";
  const currentDisplayName = active ? providerDisplayName(active) : "Opencode Zen (Default)";
  const currentModelDisplay = activeModel || (active ? "Default Model" : "mimo-v2.5-free");

  const filteredModels = models.filter((m) =>
    m.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div ref={rootRef} className="relative flex-shrink-0 min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800/90 transition-all text-xs font-medium max-w-[200px] sm:max-w-[280px]"
        title="Select AI Provider & Model"
      >
        <span className="text-sm">{currentIcon}</span>
        <div className="flex flex-col items-start min-w-0 text-left">
          <span className="text-zinc-900 dark:text-zinc-100 font-semibold truncate max-w-[130px] sm:max-w-[190px]">
            {currentDisplayName}
          </span>
          <span className="text-[10px] text-zinc-500 truncate max-w-[130px] sm:max-w-[190px]">
            {currentModelDisplay}
          </span>
        </div>
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
        <div className="absolute right-0 top-full mt-2 w-84 z-50 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-3 animate-message space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Active Provider
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">
              Ready
            </span>
          </div>

          {/* Providers List */}
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            <button
              onClick={() => {
                pickProvider(null, null);
                setOpen(false);
              }}
              className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center gap-2.5 ${
                activeProviderId === null
                  ? "bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-500/30 text-indigo-900 dark:text-indigo-200"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <span className="text-base">🍃</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">Default Free Tier</p>
                <p className="text-[10px] text-zinc-500 truncate">mimo-v2.5-free</p>
              </div>
              {activeProviderId === null && (
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
              )}
            </button>

            {providers.map((p) => {
              const isSelected = activeProviderId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    pickProvider(p.id, null);
                    loadModels(p);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center gap-2.5 ${
                    isSelected
                      ? "bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-500/30 text-indigo-900 dark:text-indigo-200"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <span className="text-base">{getProviderIcon(p.baseURL)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{providerDisplayName(p)}</p>
                    <p className="text-[10px] text-zinc-500 truncate">{p.baseURL}</p>
                  </div>
                  {isSelected && (
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Model picker for chosen provider */}
          {active && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Select Model
                </span>
                {loadingModels && (
                  <span className="text-[10px] text-zinc-400 animate-pulse">Loading…</span>
                )}
              </div>

              {modelsError && (
                <p className="text-[11px] text-rose-500 px-1">{modelsError}</p>
              )}

              {models.length > 5 && (
                <input
                  type="text"
                  placeholder="Filter models…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100"
                />
              )}

              {filteredModels.length > 0 ? (
                <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
                  {filteredModels.map((m) => {
                    const isModelSelected = activeModel === m;
                    return (
                      <button
                        key={m}
                        onClick={() => {
                          onSelect(activeProviderId, m);
                          setOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs truncate transition-all flex items-center justify-between ${
                          isModelSelected
                            ? "bg-indigo-600 text-white font-medium shadow-sm"
                            : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span className="truncate">{m}</span>
                        {isModelSelected && <span>✓</span>}
                      </button>
                    );
                  })}
                </div>
              ) : !loadingModels ? (
                <div className="p-2 text-center text-xs text-zinc-400">
                  No models returned. You can configure in sidebar.
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
