// Agent types — a lightweight, streaming agent loop built on the openai SDK.
// Tools are registered in a list, so adding a new capability later is one entry.

import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";

// A source link surfaced to the user.
export type SearchSource = { title: string; url: string };

// A tool the agent can call. `definition` is the OpenAI tool schema the model
// sees; `run` executes the call and returns a string to feed back to the model.
export type AgentTool = {
  definition: ChatCompletionFunctionTool;
  run: (args: Record<string, unknown>) => Promise<string>;
};

// Events emitted by the agent loop, forwarded to the client as NDJSON so it can
// show search status, stream the final answer, and render source links.
export type AgentStreamEvent =
  | { type: "status"; status: "searching"; query?: string }
  | { type: "content"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; name: string; args: string }
  | { type: "tool_result"; name: string; ok: boolean; detail?: string }
  | { type: "vfs"; snapshot: { files?: Record<string, string>; dirs?: string[] } }
  | { type: "diagram"; diagram: import("../diagram").MermaidDiagram }
  | { type: "teacher_lesson"; lesson: import("../teacher").TeacherLesson }
  | { type: "teacher_lesson_start"; title: string; introduction?: string }
  | { type: "teacher_step"; step: import("../teacher").TeacherStep }
  | { type: "sources"; sources: SearchSource[] }
  | { type: "download"; filename: string; dataUrl: string; size?: number }
  | { type: "clear_content" }
  | { type: "error"; message: string }
  | { type: "done" };

export type AgentRunOptions = {
  model: string;
  baseURL: string;
  apiKey: string;
  messages: import("openai/resources/chat/completions").ChatCompletionMessageParam[];
  tools: AgentTool[];
  maxIterations?: number;
  onEvent: (evt: AgentStreamEvent) => void;
};
