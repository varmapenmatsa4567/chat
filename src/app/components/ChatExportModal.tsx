"use client";

import { useState } from "react";
import type { Message, ChatMeta } from "../types";
import { copyText } from "../lib/clipboard";

type Props = {
  chat: ChatMeta | null;
  messages: Message[];
  isOpen: boolean;
  onClose: () => void;
};

export default function ChatExportModal({
  chat,
  messages,
  isOpen,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const chatTitle = chat?.title ?? "Conversation";

  const getMarkdown = () => {
    let md = `# ${chatTitle}\n\n*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
    for (const msg of messages) {
      const sender = msg.role === "user" ? "👤 **User**" : "✨ **Assistant**";
      md += `${sender} (${msg.timestamp.toLocaleTimeString()}):\n\n${msg.content}\n\n---\n\n`;
    }
    return md;
  };

  const getJson = () => {
    return JSON.stringify(
      {
        title: chatTitle,
        exportedAt: new Date().toISOString(),
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        })),
      },
      null,
      2
    );
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = async () => {
    const ok = await copyText(getMarkdown());
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadMarkdown = () => {
    const safeName = chatTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    downloadFile(getMarkdown(), `${safeName}.md`, "text/markdown");
  };

  const handleDownloadJson = () => {
    const safeName = chatTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    downloadFile(getJson(), `${safeName}.json`, "application/json");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-message">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                Export Conversation
              </h3>
              <p className="text-xs text-zinc-500">
                {messages.length} messages in this chat
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

        <div className="grid grid-cols-1 gap-2.5">
          <button
            onClick={handleDownloadMarkdown}
            className="flex items-center justify-between p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">📄</span>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Markdown (.md)
                </p>
                <p className="text-xs text-zinc-500">
                  Formatted text file with full code blocks
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
              Download →
            </span>
          </button>

          <button
            onClick={handleDownloadJson}
            className="flex items-center justify-between p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🧩</span>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  JSON (.json)
                </p>
                <p className="text-xs text-zinc-500">
                  Structured data with roles and timestamps
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
              Download →
            </span>
          </button>

          <button
            onClick={handleCopyMarkdown}
            className="flex items-center justify-between p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">📋</span>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {copied ? "Copied to Clipboard!" : "Copy to Clipboard"}
                </p>
                <p className="text-xs text-zinc-500">
                  Copy complete markdown transcript
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-indigo-500">
              {copied ? "✓ Copied" : "Copy"}
            </span>
          </button>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
