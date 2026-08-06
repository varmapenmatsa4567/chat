"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "./AuthProvider";
import Markdown from "./Markdown";
import GptPicker, { DEFAULT_GPT, type CustomGpt } from "./GptPicker";
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
  pinned: boolean;
};

type ApiMessage = { role: "system" | "user" | "assistant"; content: string };

// One in-flight LLM request. Requests are always processed one at a time
// (queue), so their response bubble can be shown directly below the query.
type InFlightRequest = {
  id: string;
  content: string;
  status: "waiting" | "streaming";
  tempMode: boolean;
  chatId: string | null;
  userMessageId: string | null; // the user message this reply answers
  userCreatedAt: number; // that query's timestamp — reply sorts just after it
  userContent: string; // the query text, used when building history at dispatch
  persistedId?: string | null;
};

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

function genId(): string {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function ChatInterface({
  chatId,
}: {
  chatId?: string | null;
}) {
  const { user, initializing, configured, signIn, signOut, error } = useAuth();
  const router = useRouter();

  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  // Active chat is driven by the URL (?chat=<id>), so each chat has a stable,
  // shareable route. null = no chat selected (new chat / home).
  const activeId = chatId ?? null;
  // Temporary chat: only startable from the fresh state. Conversations live in
  // local state only (no id, no Firestore) and are lost on refresh.
  const [isTemporary, setIsTemporary] = useState(false);
  const [tempMessages, setTempMessages] = useState<Message[]>([]);
  // In-flight LLM requests. Multiple can run in parallel, or wait in a queue.
  const [inFlight, setInFlight] = useState<InFlightRequest[]>([]);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [useHistory, setUseHistory] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [gpts, setGpts] = useState<CustomGpt[]>([]);
  const [activeGptId, setActiveGptId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("activeGptId") ?? DEFAULT_GPT.id;
    }
    return DEFAULT_GPT.id;
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  // Refs mirror state so async helpers avoid stale closures.
  const inFlightRef = useRef<InFlightRequest[]>([]);
  const streamingRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const tempMessagesRef = useRef<Message[]>([]);
  const useHistoryRef = useRef(useHistory);
  const activeGptRef = useRef<CustomGpt>(DEFAULT_GPT);

  const activeGpt = gpts.find((g) => g.id === activeGptId) ?? DEFAULT_GPT;
  const busy = inFlight.length > 0;

  const addInFlight = (entry: InFlightRequest) => {
    inFlightRef.current = [...inFlightRef.current, entry];
    setInFlight(inFlightRef.current);
  };
  const updateInFlight = (
    id: string,
    updater: (r: InFlightRequest) => InFlightRequest
  ) => {
    inFlightRef.current = inFlightRef.current.map((r) =>
      r.id === id ? updater(r) : r
    );
    setInFlight(inFlightRef.current);
  };
  const removeInFlight = (id: string) => {
    inFlightRef.current = inFlightRef.current.filter((r) => r.id !== id);
    setInFlight(inFlightRef.current);
  };

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    tempMessagesRef.current = tempMessages;
  }, [tempMessages]);
  useEffect(() => {
    useHistoryRef.current = useHistory;
  }, [useHistory]);
  useEffect(() => {
    activeGptRef.current = activeGpt;
  }, [activeGpt]);
  useEffect(() => {
    localStorage.setItem("activeGptId", activeGptId);
  }, [activeGptId]);

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
          pinned: data.pinned ?? false,
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

      // Drop any in-flight request whose persisted assistant message has now
      // arrived in the streamed data (no duplicate flash).
      const next = inFlightRef.current.filter(
        (r) => !r.persistedId || !msgs.some((m) => m.id === r.persistedId)
      );
      inFlightRef.current = next;
      setInFlight(next);
    });
    return unsub;
  }, [user, activeId]);

  // Realtime list of this user's custom GPTs
  useEffect(() => {
    if (!db || !user) {
      setGpts([]);
      return;
    }
    const col = collection(db, `users/${user.uid}/gpts`);
    const q = query(col, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: CustomGpt[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name ?? "Untitled",
          instructions: data.instructions ?? "",
        };
      });
      setGpts(list);
    });
    return unsub;
  }, [user]);

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
  const isTemporaryMode = isTemporary;

  // Interleave each in-flight reply directly below its query message.
  const transientById = new Map(inFlight.map((r) => [r.userMessageId, r]));
  const source = isTemporaryMode ? tempMessages : messages;
  const allMessages: Message[] = [];
  for (const m of source) {
    allMessages.push(m);
    const req = transientById.get(m.id);
    if (req) {
      allMessages.push({
        id: req.id,
        role: "assistant" as const,
        content: req.content,
        timestamp: new Date(),
      });
    }
  }
  // Safety: any reply whose query hasn't arrived in `source` yet goes last.
  for (const r of inFlight) {
    if (!allMessages.some((m) => m.id === r.id)) {
      allMessages.push({
        id: r.id,
        role: "assistant" as const,
        content: r.content,
        timestamp: new Date(),
      });
    }
  }

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

  // Close the settings menu on outside click / Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  function newChat() {
    router.replace("/");
    setIsTemporary(false);
    setTempMessages([]);
    setInput("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  function startTemporaryChat() {
    setIsTemporary(true);
    setTempMessages([]);
    setInput("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  function selectConversation(id: string) {
    router.push(`/?chat=${id}`);
    setIsTemporary(false);
    setTempMessages([]);
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
      if (activeId === id) router.replace("/");
    } catch (err) {
      console.error("Failed to delete chat", err);
    }
  }

  async function togglePin(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!db || !user) return;
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/chats/${id}`), {
        pinned: !chat.pinned,
      });
    } catch (err) {
      console.error("Failed to toggle pin", err);
    }
  }

  // Persist the final assistant reply for one in-flight request. Temp chats
  // append to local state; persisted chats write to Firestore (pre-generating
  // the id so the realtime listener swaps the transient bubble out).
  async function commitAssistant(entry: InFlightRequest, content: string) {
    if (entry.tempMode) {
      // Append the message and remove this request in one batch → no duplicate.
      setTempMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: "assistant",
          content,
          timestamp: new Date(entry.userCreatedAt + 1),
        },
      ]);
      removeInFlight(entry.id);
      return;
    }
    if (!db || !user || !entry.chatId) {
      removeInFlight(entry.id);
      return;
    }
    const msgCol = collection(
      db,
      `users/${user.uid}/chats/${entry.chatId}/messages`
    );
    const id = genId();
    updateInFlight(entry.id, (r) => ({ ...r, persistedId: id }));
    // Stamp the reply just after its query so Firestore (ordered by createdAt)
    // keeps it directly under that query, even if later messages were sent
    // while this reply was still streaming.
    await setDoc(doc(msgCol, id), {
      role: "assistant",
      content,
      createdAt: entry.userCreatedAt + 1,
    });
    // The entry is removed by the realtime listener once `persistedId` appears.
  }

  // Build history at dispatch time: active GPT system instructions, then all
  // finished messages + every pending (queued) user message from this request
  // onward, so nothing is lost.
  function buildHistory(entry: InFlightRequest): ApiMessage[] {
    const result: ApiMessage[] = [];
    const sys = activeGptRef.current.instructions.trim();
    if (sys) result.push({ role: "system", content: sys });

    if (!useHistoryRef.current) {
      result.push({ role: "user", content: entry.userContent });
      return result;
    }

    const list = inFlightRef.current;
    const idx = list.findIndex((r) => r.id === entry.id);
    const pending = (idx === -1 ? list : list.slice(idx)).map((r) => ({
      role: "user" as const,
      content: r.userContent,
    }));
    const finished: ApiMessage[] = entry.tempMode
      ? tempMessagesRef.current.map((m) => ({
          role: m.role,
          content: m.content,
        }))
      : messagesRef.current.map((m) => ({
          role: m.role,
          content: m.content,
        }));
    result.push(...finished, ...pending);
    return result;
  }

  // Run one request: fetch from /api/chat, stream into the entry, commit.
  async function runRequest(entry: InFlightRequest) {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: buildHistory(entry) }),
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
        updateInFlight(entry.id, (r) => ({ ...r, content: full }));
      }
      decoder.decode();

      await commitAssistant(entry, full);
    } catch (err) {
      const errMsg = `⚠️ Sorry, something went wrong: ${
        err instanceof Error ? err.message : String(err)
      }`;
      try {
        await commitAssistant(entry, errMsg);
      } catch {
        removeInFlight(entry.id);
      }
    } finally {
      streamingRef.current = false;
      processQueue();
    }
  }

  // Start the next waiting request once none is streaming (always sequential).
  async function processQueue() {
    if (streamingRef.current) return;
    const next = inFlightRef.current.find((r) => r.status === "waiting");
    if (!next) return;
    streamingRef.current = true;
    updateInFlight(next.id, (r) => ({ ...r, status: "streaming" }));
    await runRequest(next);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !user) return;

    // Clear the input immediately so it doesn't linger while writes happen.
    setInput("");

    const tempMode = isTemporaryMode;
    const wasNew = !activeId;
    let chatId: string | null = activeId;
    let userMsgId: string | null = null;
    const userCreatedAt = Date.now();

    if (tempMode) {
      // Temporary chat: store the user message in local state only.
      userMsgId = genId();
      setTempMessages((prev) => [
        ...prev,
        { id: userMsgId as string, role: "user", content: text, timestamp: new Date(userCreatedAt) },
      ]);
    } else if (db) {
      try {
        if (wasNew) {
          const chatRef = await addDoc(
            collection(db, `users/${user.uid}/chats`),
            {
              title: text.length > 40 ? text.slice(0, 40) + "…" : text,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              pinned: false,
            }
          );
          chatId = chatRef.id;
          // Give the new chat a stable, shareable URL. replace() keeps the
          // current component instance mounted, so streaming state is preserved.
          router.replace(`/?chat=${chatId}`);
        } else {
          updateDoc(doc(db, `users/${user.uid}/chats/${chatId}`), {
            updatedAt: Date.now(),
          });
        }

        const userDoc = await addDoc(
          collection(db, `users/${user.uid}/chats/${chatId}/messages`),
          { role: "user", content: text, createdAt: userCreatedAt }
        );
        userMsgId = userDoc.id;
      } catch (err) {
        console.error("Failed to save message", err);
        return;
      }
    }

    if (!tempMode && !chatId) return;

    // History is NOT snapshot here — it's built at dispatch time in
    // buildHistory() (after the previous reply completes), so it includes the
    // finished messages plus all pending queued messages.
    const entry: InFlightRequest = {
      id: genId(),
      content: "",
      status: "waiting",
      tempMode,
      chatId,
      userMessageId: userMsgId,
      userCreatedAt,
      userContent: text,
    };
    addInFlight(entry);
    processQueue(); // starts now if idle, otherwise waits its turn
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Group chats by date label for the sidebar, with pinned chats pinned to top
  const pinnedChats = chats.filter((c) => c.pinned);
  const grouped: Record<string, ChatMeta[]> = {};
  for (const c of chats) {
    if (c.pinned) continue;
    const label = formatDate(new Date(c.createdAt));
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(c);
  }
  const sections: { label: string; chats: ChatMeta[] }[] = [];
  if (pinnedChats.length) sections.push({ label: "Pinned", chats: pinnedChats });
  for (const [label, convs] of Object.entries(grouped)) {
    sections.push({ label, chats: convs });
  }

  // ----- Auth gates -----
  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-black">
        <div className="w-6 h-6 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100 animate-spin" />
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex h-screen items-center justify-center px-6 bg-white dark:bg-black">
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
      <div className="flex h-screen items-center justify-center px-6 bg-white dark:bg-black">
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
    <div className="flex h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 overflow-hidden">
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
          bg-zinc-50 dark:bg-zinc-900
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
          {sections.map(({ label, chats: convs }) => (
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
                        onClick={(e) => togglePin(e, c.id)}
                        className={`ml-1 p-0.5 rounded transition-opacity ${
                          c.pinned
                            ? "text-blue-500"
                            : "text-zinc-500 sm:opacity-0 sm:group-hover:opacity-100 hover:text-blue-500"
                        }`}
                        title={c.pinned ? "Unpin" : "Pin"}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill={c.pinned ? "currentColor" : "none"}
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z"
                          />
                        </svg>
                      </span>
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
        <header className="h-14 flex items-center px-3 gap-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-black flex-shrink-0">
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
            {isTemporaryMode
              ? "Temporary Chat"
              : activeConversation
                ? activeConversation.title
                : "New Chat"}
          </span>

          <GptPicker
            user={user}
            gpts={gpts}
            activeGptId={activeGptId}
            onSelect={setActiveGptId}
          />

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

          {/* Settings gear + dropdown */}
          <div ref={settingsRef} className="relative flex-shrink-0">
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500"
              title="Settings"
              aria-haspopup="true"
              aria-expanded={settingsOpen}
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
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>

            {settingsOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 z-50 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    Include history
                  </span>
                  <button
                    onClick={() => setUseHistory((o) => !o)}
                    role="switch"
                    aria-checked={useHistory}
                    title={useHistory ? "History on" : "History off"}
                    className="inline-flex items-center"
                  >
                    <span
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        useHistory
                          ? "bg-zinc-800 dark:bg-zinc-100"
                          : "bg-zinc-300 dark:bg-zinc-600"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-black transition-transform ${
                          useHistory ? "translate-x-4" : ""
                        }`}
                      />
                    </span>
                  </button>
                </div>
                <p className="px-2 pb-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                  Send prior messages as context.
                </p>
              </div>
            )}
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          {!activeConversation && !isTemporaryMode ? (
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
              <button
                onClick={startTemporaryChat}
                className="mt-1 px-4 py-2 rounded-full border border-zinc-300 dark:border-zinc-600 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
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
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                  />
                </svg>
                Start a temporary chat
              </button>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
              {isTemporaryMode && allMessages.length === 0 && (
                <p className="text-center text-sm text-zinc-400 dark:text-zinc-500">
                  This is a temporary chat — nothing will be saved. Messages
                  disappear when you refresh the page.
                </p>
              )}
              {allMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 group ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex flex-col gap-1 min-w-0 ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-base leading-relaxed min-w-0 max-w-full ${
                        msg.role === "user"
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-br-sm whitespace-pre-wrap break-words"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-bl-sm"
                      }`}
                    >
                      {msg.role === "assistant" ? (() => {
                        const req = inFlight.find((r) => r.id === msg.id);
                        if (req && req.status === "waiting") {
                          return (
                            <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                              <svg
                                className="w-3.5 h-3.5 animate-pulse"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 6v6l4 2"
                                />
                              </svg>
                              Queued…
                            </span>
                          );
                        }
                        if (req && req.content === "") {
                          return (
                            <span className="inline-flex gap-1 py-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" />
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce [animation-delay:120ms]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce [animation-delay:240ms]" />
                            </span>
                          );
                        }
                        return <Markdown content={msg.content} />;
                      })() : (
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
        <div className="border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-black p-3 sm:p-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3 border border-zinc-200 dark:border-zinc-700 focus-within:border-zinc-400 dark:focus-within:border-zinc-500 transition-colors">
              <div className="flex items-end gap-3">
                <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message..."
                rows={1}
                className="flex-1 bg-transparent resize-none outline-none text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 max-h-40 overflow-y-auto leading-relaxed"
                style={{ minHeight: "24px" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className="p-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors flex-shrink-0"
                title="Send (Enter)"
              >
                {busy ? (
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
