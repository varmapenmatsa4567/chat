"use client";

import { useState, useRef, useEffect } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "./AuthProvider";
import Markdown from "./Markdown";
import { copyText } from "../lib/clipboard";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type ChatMeta = {
  id: string;
  title: string;
  createdAt: number;
};

type ApiMessage = { role: "user" | "assistant"; content: string };

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

export default function ChatInterface() {
  const { user, initializing, configured, signIn, signOut, error } = useAuth();

  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingAssistant, setPendingAssistant] = useState<Message | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Realtime sidebar: this user's chats
  useEffect(() => {
    if (!db || !user) {
      setChats([]);
      return;
    }
    const col = collection(db, `users/${user.uid}/chats`);
    const q = query(col, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: ChatMeta[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title ?? "Untitled",
          createdAt: data.createdAt ?? 0,
        };
      });
      setChats(list);
    });
    return unsub;
  }, [user]);

  // Realtime messages for the active chat
  useEffect(() => {
    if (!db || !user || !activeId) {
      setMessages([]);
      return;
    }
    const col = collection(db, `users/${user.uid}/chats/${activeId}/messages`);
    const q = query(col, orderBy("createdAt", "asc"));
    const unsub: Unsubscribe = onSnapshot(q, (snap) => {
      const msgs: Message[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          role: data.role,
          content: data.content ?? "",
          timestamp: new Date(data.createdAt ?? Date.now()),
        };
      });
      setMessages(msgs);
    });
    return unsub;
  }, [user, activeId]);

  async function copyMessage(id: string, content: string) {
    if (await copyText(content)) {
      setCopiedMessageId(id);
      setTimeout(
        () => setCopiedMessageId((c) => (c === id ? null : c)),
        2000
      );
    }
  }

  const activeConversation = chats.find((c) => c.id === activeId);
  const allMessages: Message[] = [
    ...messages,
    ...(pendingAssistant ? [pendingAssistant] : []),
  ];
  const lastMessage = allMessages[allMessages.length - 1];

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
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  async function deleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!db || !user) return;
    try {
      const base = `users/${user.uid}/chats/${id}`;
      const msgCol = collection(db, `${base}/messages`);
      const snap = await getDocs(msgCol);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, base));
      if (activeId === id) setActiveId(null);
    } catch (err) {
      console.error("Failed to delete chat", err);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading || !db || !user) return;

    const wasNew = !activeId;
    let chatId: string | null = activeId;

    try {
      if (wasNew) {
        const chatRef = await addDoc(collection(db, `users/${user.uid}/chats`), {
          title: text.length > 40 ? text.slice(0, 40) + "…" : text,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        chatId = chatRef.id;
        setActiveId(chatId);
      } else {
        updateDoc(doc(db, `users/${user.uid}/chats/${chatId}`), {
          updatedAt: Date.now(),
        });
      }

      await addDoc(
        collection(db, `users/${user.uid}/chats/${chatId}/messages`),
        { role: "user", content: text, createdAt: Date.now() }
      );
    } catch (err) {
      console.error("Failed to save message", err);
      return;
    }

    if (!chatId) return;
    setInput("");

    // History for the LLM: prior persisted messages + this new user message
    const history: ApiMessage[] = wasNew
      ? []
      : messages.map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: "user", content: text });

    setPendingAssistant({
      id: "pending-" + Date.now(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    });
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
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
        setPendingAssistant((p) => (p ? { ...p, content: full } : p));
      }
      decoder.decode();

      await addDoc(
        collection(db, `users/${user.uid}/chats/${chatId}/messages`),
        { role: "assistant", content: full, createdAt: Date.now() }
      );
    } catch (err) {
      const errMsg = `⚠️ Sorry, something went wrong: ${
        err instanceof Error ? err.message : String(err)
      }`;
      try {
        await addDoc(
          collection(db, `users/${user.uid}/chats/${chatId}/messages`),
          { role: "assistant", content: errMsg, createdAt: Date.now() }
        );
      } catch {
        /* ignore */
      }
    } finally {
      setPendingAssistant(null);
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

  // Group chats by date label for the sidebar
  const grouped: Record<string, ChatMeta[]> = {};
  for (const c of chats) {
    const label = formatDate(new Date(c.createdAt));
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(c);
  }

  // ----- Auth gates -----
  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-zinc-900">
        <div className="w-6 h-6 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100 animate-spin" />
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex h-screen items-center justify-center px-6 bg-white dark:bg-zinc-900">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold mb-2">Firebase not configured</h1>
          <p className="text-sm text-zinc-500">
            Add your Firebase web config to <code>.env</code> (see{" "}
            <code>.env.example</code>) and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center px-6 bg-white dark:bg-zinc-900">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 w-12 h-12 rounded-2xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
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
          <h1 className="text-2xl font-semibold mb-2">Welcome</h1>
          <p className="text-sm text-zinc-500 mb-6">
            Sign in to start chatting. Your conversations are stored securely
            in your account.
          </p>
          <button
            onClick={signIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18a11 11 0 000 9.88l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 00-9.82 6.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google
          </button>
          {error && (
            <p className="mt-4 text-sm text-red-500">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // ----- Main chat UI -----
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

          {chats.length === 0 && (
            <p className="px-3 py-4 text-xs text-zinc-400 dark:text-zinc-500 text-center">
              No conversations yet
            </p>
          )}
        </nav>

        <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700 flex-shrink-0 flex items-center justify-center text-sm font-semibold">
            {(user.displayName ?? user.email ?? "?")[0].toUpperCase()}
          </div>
          <span className="text-sm truncate flex-1 text-zinc-700 dark:text-zinc-300">
            {user.displayName ?? user.email}
          </span>
          <button
            onClick={signOut}
            title="Sign out"
            className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-500 flex-shrink-0"
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
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
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
              {allMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 group ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex flex-col gap-1 min-w-0 ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed min-w-0 max-w-full ${
                        msg.role === "user"
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-br-sm whitespace-pre-wrap break-words"
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
