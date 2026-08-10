import type { User } from "firebase/auth";
import type { MermaidDiagram } from "../lib/diagram";
import type { TeacherLesson } from "../lib/teacher";

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  diagrams?: MermaidDiagram[];
  teacherLesson?: TeacherLesson;
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

// A live entry in the agent's activity feed (reasoning + tool calls/results).
export type AgentActivityItem =
  | { kind: "reasoning"; text: string }
  | { kind: "tool_call"; name: string; args: string }
  | { kind: "tool_result"; name: string; ok: boolean; detail?: string };

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
  // A file/project the agent produced for download (data URL).
  download?: { filename: string; dataUrl: string; size?: number };
  // Live agent activity feed (reasoning + tool calls/results).
  activity?: AgentActivityItem[];
  // Mermaid diagrams the agent generated for this reply.
  diagrams?: MermaidDiagram[];
  // AI Teacher Mode: request teaches a topic as a step-by-step SVG lesson.
  teacherMode?: boolean;
  teacherLesson?: TeacherLesson;
  // True once the stream's "done"/"error" frame was received (no more steps
  // will arrive). Lets the streaming lesson player know playback can end.
  streamFinished?: boolean;
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
