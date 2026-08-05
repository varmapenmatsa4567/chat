"use client";

import { useState, useRef, useEffect } from "react";
import Markdown from "./Markdown";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
};

const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: "1",
    title: "How does React work?",
    createdAt: new Date(Date.now() - 86400000 * 2),
    messages: [
      {
        id: "m1",
        role: "user",
        content: "How does React work?",
        timestamp: new Date(Date.now() - 86400000 * 2),
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "React is a JavaScript library for building user interfaces. It works by maintaining a virtual DOM — a lightweight copy of the actual DOM. When state changes, React computes the diff between the old and new virtual DOM and updates only the parts of the real DOM that changed. This makes updates fast and efficient.",
        timestamp: new Date(Date.now() - 86400000 * 2),
      },
    ],
  },
  {
    id: "2",
    title: "Explain async/await in JS",
    createdAt: new Date(Date.now() - 86400000),
    messages: [
      {
        id: "m3",
        role: "user",
        content: "Explain async/await in JS",
        timestamp: new Date(Date.now() - 86400000),
      },
      {
        id: "m4",
        role: "assistant",
        content:
          "async/await is syntactic sugar over Promises. An `async` function always returns a Promise. Inside it, `await` pauses execution until the awaited Promise resolves, letting you write asynchronous code that reads like synchronous code. Errors can be caught with try/catch blocks.",
        timestamp: new Date(Date.now() - 86400000),
      },
    ],
  },
  {
    id: "3",
    title: "What is TypeScript?",
    createdAt: new Date(Date.now() - 3600000),
    messages: [
      {
        id: "m5",
        role: "user",
        content: "What is TypeScript?",
        timestamp: new Date(Date.now() - 3600000),
      },
      {
        id: "m6",
        role: "assistant",
        content:
          "TypeScript is a statically typed superset of JavaScript developed by Microsoft. It adds optional type annotations, interfaces, generics, and other features that help catch errors at compile time rather than runtime. TypeScript compiles down to plain JavaScript.",
        timestamp: new Date(Date.now() - 3600000),
      },
    ],
  },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

let nextId = 100;
function uid() {
  return String(nextId++);
}

type ApiMessage = { role: "user" | "assistant"; content: string };

export default function ChatInterface() {
  const [conversations, setConversations] =
    useState<Conversation[]>(SAMPLE_CONVERSATIONS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamTargetIdRef = useRef<string | null>(null);
  const assistantMsgIdRef = useRef<string | null>(null);

  async function copyMessage(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(id);
      setTimeout(
        () => setCopiedMessageId((c) => (c === id ? null : c)),
        2000
      );
    } catch {
      // clipboard unavailable
    }
  }

  const activeConversation = conversations.find((c) => c.id === activeId);
  const lastMessage =
    activeConversation?.messages[activeConversation.messages.length - 1];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastMessage?.content]);

  // Close sidebar on small screens when screen resizes up
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (!e.matches) setSidebarOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function newChat() {
    setActiveId(null);
    setInput("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  function selectConversation(id: string) {
    setActiveId(id);
    setInput("");
    // Close drawer on mobile after selecting
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  function deleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    const assistantMsg: Message = {
      id: uid(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    assistantMsgIdRef.current = assistantMsg.id;

    // Determine target conversation
    let convId: string;
    if (activeId) {
      convId = activeId;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? { ...c, messages: [...c.messages, userMsg, assistantMsg] }
            : c
        )
      );
    } else {
      const newConv: Conversation = {
        id: uid(),
        title: text.length > 40 ? text.slice(0, 40) + "…" : text,
        createdAt: new Date(),
        messages: [userMsg, assistantMsg],
      };
      convId = newConv.id;
      setConversations((prev) => [newConv, ...prev]);
      setActiveId(newConv.id);
    }
    streamTargetIdRef.current = convId;

    setInput("");
    setIsLoading(true);

    // Build API history: prior messages + the new user message
    const history = activeConversation ? activeConversation.messages : [];
    const apiMessages: ApiMessage[] = [...history, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const appendToAssistant = (content: string) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === streamTargetIdRef.current
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsgIdRef.current
                    ? { ...m, content }
                    : m
                ),
              }
            : c
        )
      );
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Request failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        appendToAssistant(full);
      }
      decoder.decode();
    } catch (err) {
      appendToAssistant(
        `⚠️ Sorry, something went wrong: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Group conversations by date label
  const grouped: Record<string, Conversation[]> = {};
  for (const c of conversations) {
    const label = formatDate(c.createdAt);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(c);
  }

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed drawer on mobile, inline collapsible on md+ */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col w-72 overflow-hidden
          bg-zinc-50 dark:bg-zinc-800
          border-r border-zinc-200 dark:border-zinc-700
          transition-all duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:z-auto md:translate-x-0 md:flex-shrink-0
          ${sidebarOpen ? "md:w-64" : "md:w-0 md:border-r-0"}
        `}
      >
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
          <span className="font-semibold text-sm text-zinc-700 dark:text-zinc-300">
            Chats
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={newChat}
              title="New chat"
              className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
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
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              title="Close sidebar"
              className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors md:hidden"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
          {Object.entries(grouped).map(([label, convs]) => (
            <div key={label}>
              <p className="px-2 py-1 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                {label}
              </p>
              <ul className="space-y-0.5">
                {convs.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => selectConversation(c.id)}
                      className={`group w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                        activeId === c.id
                          ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                          : "hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      <span className="truncate flex-1">{c.title}</span>
                      <span
                        role="button"
                        onClick={(e) => deleteConversation(e, c.id)}
                        className="ml-1 sm:opacity-0 sm:group-hover:opacity-100 p-0.5 rounded hover:text-red-500 transition-opacity"
                        title="Delete"
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
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {conversations.length === 0 && (
            <p className="px-3 py-4 text-xs text-zinc-400 dark:text-zinc-500 text-center">
              No conversations yet
            </p>
          )}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="h-14 flex items-center px-3 gap-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
          >
            <svg
              className="w-5 h-5 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <span className="font-semibold text-sm sm:text-base truncate flex-1">
            {activeConversation ? activeConversation.title : "New Chat"}
          </span>
          <button
            onClick={newChat}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 flex-shrink-0"
            title="New chat"
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
          </button>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          {!activeConversation ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white dark:text-zinc-900"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold text-zinc-800 dark:text-zinc-200 text-center">
                How can I help you today?
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
                Start a conversation by typing a message below.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {activeConversation.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 group ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-zinc-900 dark:bg-zinc-100 flex-shrink-0 flex items-center justify-center mt-0.5">
                      <svg
                        className="w-4 h-4 text-white dark:text-zinc-900"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 14a6 6 0 110-12 6 6 0 010 12zm-1-7h2v4H9V9zm0-3h2v2H9V6z" />
                      </svg>
                    </div>
                  )}

                  <div
                    className={`flex flex-col gap-1 max-w-[85%] sm:max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-br-sm whitespace-pre-wrap"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-bl-sm"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        msg.content === "" && isLoading ? (
                          <span className="inline-flex gap-1 py-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" />
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce [animation-delay:120ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce [animation-delay:240ms]" />
                          </span>
                        ) : (
                          <Markdown content={msg.content} />
                        )
                      ) : (
                        msg.content
                      )}
                    </div>
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        {formatTime(msg.timestamp)}
                      </span>
                      <button
                        onClick={() => copyMessage(msg.id, msg.content)}
                        className="p-0.5 rounded text-zinc-400 dark:text-zinc-500
                                   hover:text-zinc-700 dark:hover:text-zinc-300
                                   sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        title="Copy message"
                      >
                        {copiedMessageId === msg.id ? (
                          <svg
                            className="w-3.5 h-3.5 text-emerald-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
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
                              d="M8 5H6a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M8 5a2 2 0 002 2h4a2 2 0 002-2M8 5a2 2 0 012-2h4a2 2 0 012 2"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0 flex items-center justify-center mt-0.5">
                      <svg
                        className="w-4 h-4 text-zinc-600 dark:text-zinc-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input */}
        <div className="border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 sm:p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3 bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3 border border-zinc-200 dark:border-zinc-700 focus-within:border-zinc-400 dark:focus-within:border-zinc-500 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message..."
                rows={1}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 max-h-40 overflow-y-auto leading-relaxed"
                style={{ minHeight: "24px" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="p-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors flex-shrink-0"
                title="Send (Enter)"
              >
                {isLoading ? (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
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
                      d="M5 12h14M12 5l7 7-7 7"
                    />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 mt-2 hidden sm:block">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
