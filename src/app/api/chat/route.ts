import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { runAgent } from "../../../lib/agent/run";
import { AGENT_TOOLS } from "../../../lib/agent/tools";
import { VirtualFileSystem } from "../../../lib/vfs/VirtualFileSystem";
import { createVfsTools } from "../../../lib/vfs/vfsTools";
import type { AgentStreamEvent } from "../../../lib/agent/types";

export const runtime = "nodejs";

type ProviderInfo = {
  baseURL?: string;
  model?: string;
  apiKey?: string;
};

type VfsSnapshot = { files?: Record<string, string>; dirs?: string[] };

type ChatRequestBody = {
  messages: ChatCompletionMessageParam[];
  provider?: ProviderInfo;
  searchEnabled?: boolean;
  conversationId?: string;
  vfs?: VfsSnapshot | null;
};

// Tells the model it may search the web when the answer could be current info.
const SEARCH_HINT: ChatCompletionMessageParam = {
  role: "system",
  content:
    "You are a helpful assistant. You may use the web_search tool when the user asks about current events, recent news, live data, or anything you are not confident about. Prefer searching when the information may have changed or you do not know it.",
};

// Tells the model it has a virtual filesystem to build projects in, and to use
// the VFS tools rather than pasting file contents in the chat.
const VFS_HINT: ChatCompletionMessageParam = {
  role: "system",
  content:
    "You have an isolated virtual filesystem for this conversation where you can build and store projects and files. When the user asks you to create, build, or edit a project (or specific files like a React app, a script, a config, etc.), DO NOT just paste the file contents into the chat. Instead:\n" +
    "1. Use the VFS tools (create_file, update_file, delete_file, list_files, get_file_tree, search_files) to write and manage the files.\n" +
    "2. When the user asks for a single file, call download_file to let them download it.\n" +
    "3. When the user asks for a whole project/folder, call download_project to zip the entire virtual filesystem and emit it as a downloadable .zip.\n" +
    "4. Keep your chat reply short: summarize what you created and (optionally) show the file tree, but do not inline full file contents.",
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequestBody;
  const { messages } = body;

  const baseURL = body.provider?.baseURL || "https://opencode.ai/zen/v1";
  const apiKey = body.provider?.apiKey || process.env.OPENAI_API_KEY;
  const model = body.provider?.model || "mimo-v2.5-free";

  if (!apiKey) {
    return new Response("Missing API key for the selected provider", {
      status: 500,
    });
  }

  const searchEnabled = Boolean(body.searchEnabled);
  const conversationId = body.conversationId?.trim() || null;

  const client = new OpenAI({ baseURL, apiKey });
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      // Map agent stream events to NDJSON frames.
      const agentEmit = (evt: AgentStreamEvent) => {
        switch (evt.type) {
          case "content":
            emit({ t: "content", d: evt.text });
            break;
          case "reasoning":
            emit({ t: "reasoning", d: evt.text });
            break;
          case "tool_call":
            emit({ t: "tool_call", name: evt.name, args: evt.args });
            break;
          case "tool_result":
            emit({ t: "tool_result", name: evt.name, ok: evt.ok, detail: evt.detail });
            break;
          case "status":
            emit({ t: "status", s: evt.status, q: evt.query });
            break;
          case "sources":
            emit({ t: "sources", urls: evt.sources });
            break;
          case "download":
            emit({ t: "download", filename: evt.filename, dataUrl: evt.dataUrl, size: evt.size });
            break;
          case "error":
            emit({ t: "error", d: evt.message });
            break;
          case "done":
            emit({ t: "done" });
            break;
        }
      };

      // Per-conversation virtual filesystem, restored from the snapshot the
      // client sent (which it persisted to Firestore on the previous turn).
      const vfs = body.vfs ? VirtualFileSystem.fromJSON(body.vfs) : new VirtualFileSystem();

      const tools = [
        ...(searchEnabled ? AGENT_TOOLS : []),
        ...(conversationId ? createVfsTools(vfs, agentEmit) : []),
      ];

      try {
        if (tools.length > 0) {
          const hints: ChatCompletionMessageParam[] = [];
          if (searchEnabled) hints.push(SEARCH_HINT);
          if (conversationId) hints.push(VFS_HINT);
          const history: ChatCompletionMessageParam[] = [...hints, ...messages];

          await runAgent({
            model,
            baseURL,
            apiKey,
            messages: history,
            tools,
            onEvent: agentEmit,
          });

          // Return the updated VFS snapshot so the client persists it per
          // conversation (the agent may have created/edited files). Emitted
          // before "done" so the client reads it before closing the stream.
          if (conversationId) {
            emit({ t: "vfs", files: vfs.toJSON() });
          }
          emit({ t: "done" });
        } else {
          const stream = await client.chat.completions.create({
            model,
            messages,
            stream: true,
          });
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) emit({ t: "content", d: delta });
          }
          emit({ t: "done" });
        }
      } catch (err) {
        emit({ t: "error", d: messageOf(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
