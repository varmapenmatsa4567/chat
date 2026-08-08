import type { User } from "firebase/auth";

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
};

export type ChatMeta = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt?: number;
  pinned: boolean;
};

export type ApiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type SearchSource = { title: string; url: string };

export type InFlightRequest = {
  id: string;
  content: string;
  status: "waiting" | "streaming";
  tempMode: boolean;
  chatId: string | null;
  userMessageId: string | null;
  userCreatedAt: number;
  userContent: string;
  persistedId?: string | null;
  abortController?: AbortController;
  // Web-search status for the transient bubble.
  searching?: boolean;
  sources?: SearchSource[];
};

export type CustomGpt = {
  id: string;
  name: string;
  instructions: string;
  icon?: string;
  description?: string;
  isPreset?: boolean;
};

export type AppSettings = {
  useHistory: boolean;
  soundEnabled: boolean;
  enterToSend: boolean;
  systemPrompt?: string;
  // When enabled, the AI may search the web for up-to-date answers.
  searchEnabled?: boolean;
};
