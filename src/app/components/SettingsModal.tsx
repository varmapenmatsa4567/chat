"use client";

import { useState } from "react";
import type { AppSettings } from "../types";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (updater: (prev: AppSettings) => AppSettings) => void;
  onOpenProvidersTab?: () => void;
  onOpenGptsTab?: () => void;
};

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onOpenProvidersTab,
  onOpenGptsTab,
}: Props) {
  const [activeTab, setActiveTab] = useState<"general" | "shortcuts">("general");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-message">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-200">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                Application Settings
              </h3>
              <p className="text-xs text-zinc-500">
                Preferences, context controls & shortcuts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <svg
              className="w-5 h-5"
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
        </div>

        {/* Tab switcher */}
        <div className="flex bg-zinc-100 dark:bg-zinc-800/60 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("general")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === "general"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            General & Chat
          </button>
          <button
            onClick={() => setActiveTab("shortcuts")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === "shortcuts"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            Keyboard Shortcuts
          </button>
        </div>

        {activeTab === "general" ? (
          <div className="space-y-4">
            {/* Conversation History Context */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800">
              <div className="space-y-0.5 max-w-[80%]">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Include Conversation History
                </p>
                <p className="text-xs text-zinc-500">
                  Pass previous conversation turns as context for follow-up questions.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    useHistory: !prev.useHistory,
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.useHistory ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.useHistory ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Web Search */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800">
              <div className="space-y-0.5 max-w-[80%]">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Web Search
                </p>
                <p className="text-xs text-zinc-500">
                  Let the AI search the web for current, up-to-date answers when
                  it decides they're needed.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    searchEnabled: !prev.searchEnabled,
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.searchEnabled
                    ? "bg-indigo-600"
                    : "bg-zinc-300 dark:bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.searchEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                onClick={() => {
                  onClose();
                  onOpenProvidersTab?.();
                }}
                className="p-3 text-left rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span>⚡</span> Manage Providers
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Add custom API keys & base URLs
                </p>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenGptsTab?.();
                }}
                className="p-3 text-left rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span>🎭</span> Custom GPTs
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Configure custom prompt instructions
                </p>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">Send Message</span>
              <kbd className="px-2 py-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-300 dark:border-zinc-700">
                Enter
              </kbd>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">New Line</span>
              <div className="flex gap-1">
                <kbd className="px-2 py-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-300 dark:border-zinc-700">
                  Shift
                </kbd>
                <kbd className="px-2 py-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-300 dark:border-zinc-700">
                  Enter
                </kbd>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">Close Modals / Popups</span>
              <kbd className="px-2 py-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-300 dark:border-zinc-700">
                Esc
              </kbd>
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
