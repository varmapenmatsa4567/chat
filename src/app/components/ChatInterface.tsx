"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
import GptPicker, { PRESET_GPTS, DEFAULT_GPT } from "./GptPicker";
import GptManager from "./GptManager";
import ProviderPicker from "./ProviderPicker";
import ProviderManager from "./ProviderManager";
import ThemeToggle from "./ThemeToggle";
import VoiceInput from "./VoiceInput";
import ImageUploadOCR, { type AttachedImage } from "./ImageUploadOCR";
import ChatExportModal from "./ChatExportModal";
import SettingsModal from "./SettingsModal";
import {
  getProviderIcon,
  providerDisplayName,
  type ProviderConfig,
} from "../../lib/providers";
import { copyText } from "../lib/clipboard";
import type {
  Message,
  ChatMeta,
  ApiMessage,
  InFlightRequest,
  CustomGpt,
  AppSettings,
  SearchSource,
} from "../types";

// Suggested prompt starter cards for empty state
const STARTER_PROMPTS = [
  {
    category: "💻 Code",
    title: "Build a modern API route",
    prompt: "Write a complete Next.js 15 App Router API route with rate-limiting, error handling, and TypeScript types.",
  },
  {
    category: "✍️ Writing",
    title: "Write an engaging launch announcement",
    prompt: "Write a high-converting Product Hunt launch post for our new AI-powered developer tool.",
  },
  {
    category: "🧠 Brainstorm",
    title: "SaaS growth strategies",
    prompt: "Brainstorm 5 creative growth hacking experiments for an early-stage B2B SaaS startup.",
  },
  {
    category: "🔬 Analyze",
    title: "Explain quantum computing simply",
    prompt: "Explain quantum computing and qubit superposition using intuitive analogies for a non-technical audience.",
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
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
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
  const activeId = chatId ?? null;

  // Temporary chat state
  const [isTemporary, setIsTemporary] = useState(false);
  const [tempMessages, setTempMessages] = useState<Message[]>([]);

  // In-flight streaming requests
  const [inFlight, setInFlight] = useState<InFlightRequest[]>([]);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"chats" | "gpts" | "providers">("chats");

  // Image Attachment & OCR state
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);

  // Modals & Settings
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chat_settings");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return {
      useHistory: true,
      soundEnabled: false,
      enterToSend: true,
      searchEnabled: false,
    };
  });

  // Providers & GPTs
  const [gpts, setGpts] = useState<CustomGpt[]>([]);
  const [activeGptId, setActiveGptId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("activeGptId") ?? DEFAULT_GPT.id;
    }
    return DEFAULT_GPT.id;
  });

  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("activeProviderId");
    }
    return null;
  });
  const [activeModel, setActiveModel] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("activeProviderModel");
    }
    return null;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Active abort controllers map
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Refs for async processing
  const inFlightRef = useRef<InFlightRequest[]>([]);
  const streamingRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const tempMessagesRef = useRef<Message[]>([]);
  const settingsRef = useRef<AppSettings>(settings);
  const activeGptRef = useRef<CustomGpt>(DEFAULT_GPT);
  const activeProviderRef = useRef<ProviderConfig | null>(null);
  const activeModelRef = useRef<string | null>(null);

  const allAvailableGpts = useMemo(() => [...PRESET_GPTS, ...gpts], [gpts]);
  const activeGpt = allAvailableGpts.find((g) => g.id === activeGptId) ?? DEFAULT_GPT;
  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? null;
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
    settingsRef.current = settings;
    localStorage.setItem("chat_settings", JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    activeGptRef.current = activeGpt;
  }, [activeGpt]);
  useEffect(() => {
    activeProviderRef.current = activeProvider;
  }, [activeProvider]);
  useEffect(() => {
    activeModelRef.current = activeModel;
  }, [activeModel]);
  useEffect(() => {
    localStorage.setItem("activeGptId", activeGptId);
  }, [activeGptId]);
  useEffect(() => {
    if (activeProviderId) localStorage.setItem("activeProviderId", activeProviderId);
    else localStorage.removeItem("activeProviderId");
    if (activeModel) localStorage.setItem("activeProviderModel", activeModel);
    else localStorage.removeItem("activeProviderModel");
  }, [activeProviderId, activeModel]);

  // Realtime Chats Subscription
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
          title: data.title ?? "Untitled Conversation",
          createdAt: data.createdAt ?? 0,
          pinned: data.pinned ?? false,
        };
      });
      setChats(list);
    });
    return unsub;
  }, [user]);

  // Realtime Messages Subscription
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

      // Clean in-flight matching
      const next = inFlightRef.current.filter(
        (r) => !r.persistedId || !msgs.some((m) => m.id === r.persistedId)
      );
      inFlightRef.current = next;
      setInFlight(next);
    });
    return unsub;
  }, [user, activeId]);

  // Realtime Custom GPTs
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
          name: data.name ?? "Untitled GPT",
          instructions: data.instructions ?? "",
          description: data.description ?? "",
          icon: data.icon ?? "🤖",
        };
      });
      setGpts(list);
    });
    return unsub;
  }, [user]);

  // Realtime Providers
  useEffect(() => {
    if (!db || !user) {
      setProviders([]);
      return;
    }
    const col = collection(db, `users/${user.uid}/providers`);
    const q = query(col, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: ProviderConfig[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          label: data.label ?? "Provider",
          baseURL: data.baseURL ?? "",
          apiKey: data.apiKey ?? "",
          createdAt: data.createdAt ?? 0,
        };
      });
      setProviders(list);
    });
    return unsub;
  }, [user]);

  // Copy Message Handler
  async function copyMessage(id: string, content: string) {
    if (await copyText(content)) {
      setCopiedMessageId(id);
      setTimeout(
        () => setCopiedMessageId((c) => (c === id ? null : c)),
        2000
      );
    }
  }

  // Active chat meta
  const activeConversation = chats.find((c) => c.id === activeId) ?? null;
  const isTemporaryMode = isTemporary;

  // Interleave in-flight responses
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
  }, [lastMessage?.content, inFlight.length]);

  function newChat() {
    router.replace("/");
    setIsTemporary(false);
    setTempMessages([]);
    setInput("");
    if (window.innerWidth < 768) setSidebarOpen(false);
    inputRef.current?.focus();
  }

  function startTemporaryChat() {
    setIsTemporary(true);
    setTempMessages([]);
    setInput("");
    if (window.innerWidth < 768) setSidebarOpen(false);
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

  // Stop Generation / Abort Stream
  function stopGeneration(id: string) {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }
  }

  async function commitAssistant(entry: InFlightRequest, content: string) {
    if (entry.tempMode) {
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
    await setDoc(doc(msgCol, id), {
      role: "assistant",
      content,
      createdAt: entry.userCreatedAt + 1,
    });
  }

  function buildHistory(entry: InFlightRequest): ApiMessage[] {
    const result: ApiMessage[] = [];
    const sys = activeGptRef.current.instructions?.trim();
    if (sys) result.push({ role: "system", content: sys });

    if (!settingsRef.current.useHistory) {
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

  async function runRequest(entry: InFlightRequest) {
    const abortController = new AbortController();
    abortControllersRef.current.set(entry.id, abortController);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          messages: buildHistory(entry),
          searchEnabled: settingsRef.current.searchEnabled ?? false,
          provider: activeProviderRef.current
            ? {
                baseURL: activeProviderRef.current.baseURL,
                model: activeModelRef.current ?? undefined,
                apiKey: activeProviderRef.current.apiKey,
              }
            : undefined,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Request failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buffer = "";
      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let evt: { t?: string; d?: string; s?: string; urls?: SearchSource[] };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.t === "content" && typeof evt.d === "string") {
            full += evt.d;
            updateInFlight(entry.id, (r) => ({ ...r, content: full }));
          } else if (evt.t === "status") {
            updateInFlight(entry.id, (r) => ({ ...r, searching: true }));
          } else if (evt.t === "sources") {
            updateInFlight(entry.id, (r) => ({
              ...r,
              sources: evt.urls && evt.urls.length ? evt.urls : r.sources,
            }));
          } else if (evt.t === "error") {
            throw new Error(evt.d || "Request failed");
          } else if (evt.t === "done") {
            finished = true;
            break;
          }
        }
        if (finished) break;
      }
      decoder.decode();

      await commitAssistant(entry, full);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        const currentContent =
          inFlightRef.current.find((r) => r.id === entry.id)?.content ||
          "*(Generation stopped by user)*";
        await commitAssistant(entry, currentContent);
      } else {
        const errMsg = `⚠️ Request error: ${
          err instanceof Error ? err.message : String(err)
        }`;
        try {
          await commitAssistant(entry, errMsg);
        } catch {
          removeInFlight(entry.id);
        }
      }
    } finally {
      abortControllersRef.current.delete(entry.id);
      streamingRef.current = false;
      processQueue();
    }
  }

  async function processQueue() {
    if (streamingRef.current) return;
    const next = inFlightRef.current.find((r) => r.status === "waiting");
    if (!next) return;
    streamingRef.current = true;
    updateInFlight(next.id, (r) => ({ ...r, status: "streaming" }));
    await runRequest(next);
  }

  async function sendMessage(textToSend?: string) {
    let text = (textToSend ?? input).trim();
    if (!text && !attachedImage) return;
    if (!user) return;

    if (attachedImage) {
      const imgText = attachedImage.extractedText?.trim();
      const imgHeader = `🖼️ **[Attached Image: ${attachedImage.file.name}]**\n\n📝 **Extracted Text:**\n"""\n${imgText || "(No text detected)"}\n"""`;
      text = text ? `${imgHeader}\n\n${text}` : `${imgHeader}\n\nPlease analyze, explain, or answer based on the content of this image.`;
      setAttachedImage(null);
    }

    setInput("");

    const tempMode = isTemporaryMode;
    const wasNew = !activeId;
    let chatId: string | null = activeId;
    let userMsgId: string | null = null;
    const userCreatedAt = Date.now();

    if (tempMode) {
      userMsgId = genId();
      setTempMessages((prev) => [
        ...prev,
        {
          id: userMsgId as string,
          role: "user",
          content: text,
          timestamp: new Date(userCreatedAt),
        },
      ]);
    } else if (db) {
      try {
        if (wasNew) {
          const chatRef = await addDoc(
            collection(db, `users/${user.uid}/chats`),
            {
              title: text.length > 36 ? text.slice(0, 36) + "…" : text,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              pinned: false,
            }
          );
          chatId = chatRef.id;
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
    processQueue();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && settings.enterToSend) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Regenerate last assistant response
  const regenerateLastResponse = () => {
    if (allMessages.length === 0) return;
    const lastUserMsg = [...allMessages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      sendMessage(lastUserMsg.content);
    }
  };

  // Filter chats by search query
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    return chats.filter((c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [chats, searchQuery]);

  const pinnedChats = filteredChats.filter((c) => c.pinned);
  const regularChats = filteredChats.filter((c) => !c.pinned);

  const grouped: Record<string, ChatMeta[]> = {};
  for (const c of regularChats) {
    const label = formatDate(new Date(c.createdAt));
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(c);
  }

  const sections: { label: string; chats: ChatMeta[] }[] = [];
  if (pinnedChats.length > 0) {
    sections.push({ label: "📌 Pinned", chats: pinnedChats });
  }
  for (const [label, convs] of Object.entries(grouped)) {
    sections.push({ label, chats: convs });
  }

  // Auth Loading Gate
  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <p className="text-xs text-zinc-500 font-medium tracking-wide">Loading workspace…</p>
        </div>
      </div>
    );
  }

  // Unconfigured Gate
  if (!configured) {
    return (
      <div className="flex h-screen items-center justify-center px-6 bg-background">
        <div className="max-w-md text-center p-8 rounded-3xl glass-card space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto text-2xl">
            ⚠️
          </div>
          <h1 className="text-lg font-semibold">Firebase Configuration Missing</h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Please add your Firebase web credentials to your <code>.env</code> file and restart the development server.
          </p>
        </div>
      </div>
    );
  }

  // Unauthenticated Welcome Hero
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center px-4 bg-background bg-radial-mesh relative overflow-hidden">
        <div className="w-full max-w-md text-center p-8 sm:p-10 rounded-3xl glass-card shadow-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-6 relative z-10 animate-message">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/25">
            <span className="text-3xl">✨</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Welcome to <span className="gradient-text">AI Studio</span>
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Your high-speed intelligent workspace. Bring your own models, craft custom personas, and chat in realtime.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={signIn}
              className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-2xl bg-white dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100 shadow-sm hover:shadow group"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
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
              <span>Continue with Google</span>
            </button>

            {error && (
              <p className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-xl">{error}</p>
            )}
          </div>

          <div className="pt-2 text-[11px] text-zinc-400 flex items-center justify-center gap-4">
            <span>🔒 Encrypted Storage</span>
            <span>•</span>
            <span>⚡ Ultra Fast</span>
            <span>•</span>
            <span>🎨 BYO Models</span>
          </div>
        </div>
      </div>
    );
  }

  // Main UI Workspace
  return (
    <div className="flex h-screen w-full max-w-full bg-background text-foreground overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Modern Collapsible Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col w-80 sm:w-72 overflow-hidden
          bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)]
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:z-auto md:translate-x-0 md:flex-shrink-0
          ${sidebarOpen ? "md:w-72" : "md:w-0 md:border-r-0"}
        `}
      >
        {/* Sidebar Header & New Chat button */}
        <div className="p-3 border-b border-[var(--sidebar-border)] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                AI
              </div>
              <span className="font-bold text-sm tracking-tight gradient-text-subtle">
                AI Studio
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setSidebarOpen(false)}
                title="Collapse sidebar"
                className="p-1.5 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
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
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  />
                </svg>
              </button>
            </div>
          </div>

          <button
            onClick={newChat}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold transition-all shadow-sm group"
          >
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>New Conversation</span>
            </div>
            <span className="text-[10px] opacity-60 font-mono">⌘N</span>
          </button>
        </div>

        {/* Sidebar Tabs */}
        <div className="flex bg-zinc-200/40 dark:bg-zinc-800/40 p-1 mx-3 my-2 rounded-xl text-xs font-medium">
          <button
            onClick={() => setSidebarTab("chats")}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              sidebarTab === "chats"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            Chats
          </button>
          <button
            onClick={() => setSidebarTab("gpts")}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              sidebarTab === "gpts"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            Personas
          </button>
          <button
            onClick={() => setSidebarTab("providers")}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              sidebarTab === "providers"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            Providers
          </button>
        </div>

        {/* Tab Content */}
        {sidebarTab === "gpts" ? (
          <div className="flex-1 overflow-y-auto">
            <GptManager
              user={user}
              gpts={gpts}
              activeGptId={activeGptId}
              onSelect={setActiveGptId}
            />
          </div>
        ) : sidebarTab === "providers" ? (
          <div className="flex-1 overflow-y-auto">
            <ProviderManager
              user={user}
              providers={providers}
              activeProviderId={activeProviderId}
              onSelect={setActiveProviderId}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search bar */}
            <div className="px-3 pb-2">
              <div className="relative">
                <svg
                  className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search chats…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8.5 pr-3 py-1.5 text-xs rounded-xl bg-zinc-200/50 dark:bg-zinc-800/60 border border-transparent focus:border-indigo-500/40 outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
                />
              </div>
            </div>

            {/* Conversation List */}
            <nav className="flex-1 overflow-y-auto px-2 space-y-4">
              {sections.map(({ label, chats: convs }) => (
                <div key={label} className="space-y-1">
                  <p className="px-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    {label}
                  </p>
                  <div className="space-y-0.5">
                    {convs.map((c) => {
                      const isCurrent = activeId === c.id;
                      return (
                        <div
                          key={c.id}
                          onClick={() => selectConversation(c.id)}
                          className={`group w-full text-left px-2.5 py-2 rounded-xl text-xs transition-all flex items-center justify-between cursor-pointer ${
                            isCurrent
                              ? "bg-zinc-200/80 dark:bg-zinc-800 font-semibold text-zinc-900 dark:text-zinc-100"
                              : "hover:bg-zinc-200/40 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
                          }`}
                        >
                          <span className="truncate flex-1 pr-1">{c.title}</span>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => togglePin(e, c.id)}
                              className={`p-1 rounded-md transition-colors ${
                                c.pinned
                                  ? "text-indigo-500 opacity-100"
                                  : "text-zinc-400 hover:text-indigo-500"
                              }`}
                              title={c.pinned ? "Unpin" : "Pin to top"}
                            >
                              <svg
                                className="w-3 h-3"
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
                            </button>

                            <button
                              onClick={(e) => deleteConversation(e, c.id)}
                              className="p-1 rounded-md text-zinc-400 hover:text-rose-500 transition-colors"
                              title="Delete chat"
                            >
                              <svg
                                className="w-3 h-3"
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
              ))}

              {chats.length === 0 && (
                <div className="p-4 text-center text-xs text-zinc-400">
                  No conversations yet. Start a new chat!
                </div>
              )}
            </nav>
          </div>
        )}

        {/* User Profile Card Footer */}
        <div className="p-3 border-t border-[var(--sidebar-border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt="Avatar"
                className="w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-700 flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                {(user.displayName ?? user.email ?? "?")[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {user.displayName ?? "User"}
              </p>
              <p className="text-[10px] text-zinc-400 truncate">
                {user.email}
              </p>
            </div>
          </div>

          <button
            onClick={signOut}
            title="Sign out"
            className="p-1.5 rounded-xl hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 text-zinc-400 hover:text-rose-500 transition-colors flex-shrink-0"
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

      {/* Main Chat Workspace */}
      <div className="flex flex-col flex-1 min-w-0 h-full max-w-full overflow-hidden relative">
        {/* Top App Bar - Fixed & Non-Cluttered */}
        <header className="h-14 flex items-center justify-between px-2.5 sm:px-4 gap-1.5 sm:gap-2 border-b border-[var(--sidebar-border)] bg-background/90 backdrop-blur-md z-30 flex-shrink-0 w-full max-w-full">
          {/* Left: Hamburger + Chat Name */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              className="p-2 rounded-xl hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors flex-shrink-0 touch-manipulation"
              aria-label="Toggle Navigation Sidebar"
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
                  strokeWidth={2.2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            <span className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate min-w-0 max-w-[120px] xs:max-w-[180px] sm:max-w-[280px]">
              {isTemporaryMode
                ? "Incognito Mode"
                : activeConversation
                  ? activeConversation.title
                  : "New Conversation"}
            </span>
          </div>

          {/* Right Actions: Compact on mobile, full on desktop */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {/* Persona Selector */}
            <GptPicker
              gpts={gpts}
              activeGptId={activeGptId}
              onSelect={setActiveGptId}
            />

            {/* Provider & Model Selector */}
            <ProviderPicker
              user={user}
              providers={providers}
              activeProviderId={activeProviderId}
              activeModel={activeModel}
              onSelect={(pId, m) => {
                setActiveProviderId(pId);
                setActiveModel(m);
              }}
            />

            {/* Export Chat (Visible on >= sm) */}
            {allMessages.length > 0 && (
              <button
                onClick={() => setExportModalOpen(true)}
                title="Export Conversation"
                className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors hidden sm:block"
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </button>
            )}

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Settings Modal Toggle */}
            <button
              onClick={() => setSettingsModalOpen(true)}
              title="Settings & Shortcuts"
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors"
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
          </div>
        </header>

        {/* Message Feed Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-radial-mesh w-full max-w-full">
          {!activeConversation && !isTemporaryMode && allMessages.length === 0 ? (
            /* Empty State / Inspiration Hub */
            <div className="max-w-3xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col items-center justify-center min-h-full space-y-8 animate-message">
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white text-2xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-500/20">
                  {activeGpt.icon ?? "✨"}
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  How can I help you today?
                </h1>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                  Using <span className="font-semibold text-zinc-800 dark:text-zinc-200">{activeGpt.name}</span> with{" "}
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {activeProvider ? providerDisplayName(activeProvider) : "Free Opencode Zen"}
                  </span>
                </p>
              </div>

              {/* Starter Prompt Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {STARTER_PROMPTS.map((sp) => (
                  <button
                    key={sp.title}
                    onClick={() => sendMessage(sp.prompt)}
                    className="p-4 rounded-2xl glass-card hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left group shadow-xs space-y-1.5"
                  >
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                      {sp.category}
                    </span>
                    <p className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {sp.title}
                    </p>
                    <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                      {sp.prompt}
                    </p>
                  </button>
                ))}
              </div>

              {/* Incognito Chat Button */}
              <button
                onClick={startTemporaryChat}
                className="px-4 py-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all flex items-center gap-2"
              >
                <span>🕶️</span>
                <span>Start an incognito temporary chat (not saved)</span>
              </button>
            </div>
          ) : (
            /* Active Messages Stream - Width Constrained */
            <div className="max-w-4xl w-full mx-auto px-3 sm:px-6 py-6 space-y-6 min-w-0 overflow-x-hidden">
              {isTemporaryMode && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs text-center flex items-center justify-center gap-2">
                  <span>🕶️</span>
                  <span>
                    Temporary incognito mode active. Messages will disappear when refreshed.
                  </span>
                </div>
              )}

              {allMessages.map((msg, index) => {
                const isUser = msg.role === "user";
                const isLastAssistant = !isUser && index === allMessages.length - 1;
                const req = inFlight.find((r) => r.id === msg.id);

                return (
                  <div
                    key={msg.id}
                    className={`flex group animate-message w-full min-w-0 ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex flex-col gap-1.5 max-w-full min-w-0 ${
                        isUser ? "items-end" : "items-start"
                      }`}
                    >
                      {/* Dynamic Content-Fit Bubble */}
                      <div
                        className={`px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl text-sm leading-relaxed w-fit max-w-full min-w-0 overflow-hidden ${
                          isUser
                            ? "bg-zinc-900 dark:bg-zinc-800 text-white dark:text-zinc-100 border border-zinc-800 dark:border-zinc-700/60 shadow-sm whitespace-pre-wrap break-words rounded-tr-sm"
                            : "glass-card text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-800/80 rounded-tl-sm"
                        }`}
                      >
                        {!isUser ? (
                          req && req.status === "waiting" ? (
                            <span className="inline-flex items-center gap-2 text-zinc-400 text-xs">
                              <svg
                                className="w-3.5 h-3.5 animate-spin"
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
                              In queue…
                            </span>
                          ) : req && req.searching ? (
                            <span className="inline-flex items-center gap-2 text-zinc-400 text-xs">
                              <svg
                                className="w-3.5 h-3.5 animate-spin text-indigo-500"
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
                              🔎 Searching the web…
                            </span>
                          ) : req && req.content === "" ? (
                            <div className="flex items-center gap-1 py-1">
                              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
                              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:150ms]" />
                              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:300ms]" />
                            </div>
                          ) : (
                            <Markdown content={msg.content} />
                          )
                        ) : (
                          msg.content
                        )}
                      </div>

                      {/* Search sources */}
                      {req && req.sources && req.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 px-1.5 mt-1.5 max-w-full">
                          {req.sources.slice(0, 3).map((s, i) => (
                            <a
                              key={i}
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              title={s.url}
                              className="text-[11px] px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-colors max-w-[220px] truncate"
                            >
                              {i + 1}. {s.title}
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Action & Metadata Bar */}
                      <div className="flex items-center gap-2.5 px-1.5 text-[10px] text-zinc-400">
                        <span>{formatTime(msg.timestamp)}</span>

                        {/* Copy button */}
                        <button
                          onClick={() => copyMessage(msg.id, msg.content)}
                          className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors flex items-center gap-1"
                          title="Copy message"
                        >
                          {copiedMessageId === msg.id ? (
                            <span className="text-emerald-500 font-medium">✓ Copied</span>
                          ) : (
                            <span>Copy</span>
                          )}
                        </button>

                        {/* User edit shortcut */}
                        {isUser && (
                          <button
                            onClick={() => setInput(msg.content)}
                            className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                            title="Edit message into input"
                          >
                            Edit
                          </button>
                        )}

                        {/* Assistant Stop button while streaming */}
                        {req && req.status === "streaming" && (
                          <button
                            onClick={() => stopGeneration(req.id)}
                            className="text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1"
                          >
                            <span>⏹ Stop</span>
                          </button>
                        )}

                        {/* Regenerate for last assistant message */}
                        {isLastAssistant && !busy && (
                          <button
                            onClick={regenerateLastResponse}
                            className="hover:text-indigo-500 transition-colors flex items-center gap-1"
                            title="Regenerate response"
                          >
                            <span>↻ Retry</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Floating Input Dock */}
        <div className="border-t border-[var(--sidebar-border)] bg-background/90 backdrop-blur-md p-2.5 sm:p-4 z-20 w-full max-w-full">
          <div className="max-w-4xl w-full mx-auto space-y-2">
            <div className="glass-card rounded-2xl p-1.5 sm:p-2.5 shadow-lg border border-zinc-200/90 dark:border-zinc-800/90 focus-within:border-indigo-500/60 dark:focus-within:border-indigo-500/60 transition-all">
              {/* Attached Image Preview Card */}
              {attachedImage && (
                <div className="flex items-center gap-3 p-2 mb-2 rounded-xl bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/80 animate-message">
                  <img
                    src={attachedImage.previewUrl}
                    alt="Preview"
                    className="w-11 h-11 object-cover rounded-lg border border-zinc-300 dark:border-zinc-700 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-zinc-900 dark:text-zinc-100">
                      {attachedImage.file.name}
                    </p>
                    {attachedImage.status === "extracting" ? (
                      <p className="text-[11px] text-indigo-500 flex items-center gap-1.5 font-medium animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                        Extracting text ({attachedImage.progress}%)…
                      </p>
                    ) : attachedImage.status === "ready" ? (
                      <p className="text-[11px] text-emerald-500 flex items-center gap-1 font-medium">
                        <span>✓</span>
                        <span className="truncate">Text extracted ({attachedImage.extractedText.length} chars)</span>
                      </p>
                    ) : attachedImage.status === "error" ? (
                      <p className="text-[11px] text-rose-500">
                        {attachedImage.errorMessage || "Failed to extract text"}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(attachedImage.previewUrl);
                      setAttachedImage(null);
                    }}
                    className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors flex-shrink-0"
                    title="Remove attachment"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              <div className="flex items-end gap-1.5 sm:gap-2">
                {/* Image Upload OCR Button */}
                <ImageUploadOCR
                  attachedImage={attachedImage}
                  onImageChange={setAttachedImage}
                  disabled={busy}
                />

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${activeGpt.name}…`}
                  rows={1}
                  className="flex-1 bg-transparent resize-none outline-none text-sm sm:text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 max-h-48 overflow-y-auto leading-relaxed px-2 py-1 min-w-0"
                  style={{ minHeight: "28px" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
                  }}
                />

                {/* Voice Input */}
                <VoiceInput
                  onTranscript={(text) =>
                    setInput((prev) => (prev ? `${prev} ${text}` : text))
                  }
                  disabled={busy}
                />

                {/* Send / Stop Button */}
                {busy ? (
                  <button
                    onClick={() => {
                      const activeReq = inFlight.find((r) => r.status === "streaming");
                      if (activeReq) stopGeneration(activeReq.id);
                    }}
                    className="p-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white transition-all flex items-center justify-center flex-shrink-0"
                    title="Stop Generating"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() && !attachedImage}
                    className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/20"
                    title="Send message (Enter)"
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
                        strokeWidth={2.5}
                        d="M5 12h14M12 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Input Footer Indicator */}
            <div className="flex items-center justify-between px-2 text-[10px] text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline">
                  {settings.enterToSend ? "Press Enter to send · Shift+Enter for new line" : "Enter adds newline"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>{input.length} chars</span>
                <span>•</span>
                <span className="truncate max-w-[140px] sm:max-w-none">
                  {activeProvider ? providerDisplayName(activeProvider) : "Free Tier"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      <ChatExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        chat={activeConversation}
        messages={allMessages}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        onOpenProvidersTab={() => {
          setSidebarOpen(true);
          setSidebarTab("providers");
        }}
        onOpenGptsTab={() => {
          setSidebarOpen(true);
          setSidebarTab("gpts");
        }}
      />
    </div>
  );
}
