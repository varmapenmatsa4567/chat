import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { runAgent } from "../../../lib/agent/run";
import { AGENT_TOOLS, READ_TOOLS } from "../../../lib/agent/tools";
import { createDiagramTool } from "../../../lib/agent/tools/generateDiagram";
import { createTeacherLessonTool } from "../../../lib/agent/tools/generateTeacherLesson";
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
  teacherMode?: boolean;
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

// Tells the model when to use generate_diagram (and not to overuse it).
const DIAGRAM_HINT: ChatCompletionMessageParam = {
  role: "system",
  content:
    "You can create visual diagrams with the generate_diagram tool when a diagram materially improves the explanation.\n" +
    "Use it for: flowcharts (workflows, algorithms, processes, decision trees, login flows), sequence diagrams (API requests, service-to-service or client/server interactions), ER diagrams (database schemas, table relationships), class diagrams (OOP / TypeScript classes), state diagrams (state machines, order/authentication lifecycle), mindmaps (hierarchical concepts, brainstorming), timelines (events, milestones), and architecture diagrams (microservices, cloud, system components).\n" +
    "When you call generate_diagram, provide a valid Mermaid `code` string and the matching diagramType, then keep your surrounding text short and reference the diagram.\n" +
    "Do NOT overuse diagrams: for simple questions (e.g. \"What is React?\", \"What is REST?\", \"What does map() do?\") give a normal text answer unless a visual genuinely clarifies relationships, flow, or hierarchy.",
};

// Teacher Mode instructions — used when the user starts a message with /teacher.
const TEACHER_HINT: ChatCompletionMessageParam = {
  role: "system",
  content:
    "You are now operating in AI Teacher Mode. Your job is to teach the user's requested topic visually and step by step.\n" +
    "Create a structured TeacherLesson by calling the generate_teacher_lesson tool. Do NOT paste lesson content into the chat; always return the full structured lesson through the tool.\n" +
    "Each lesson step MUST contain: (1) a short title, (2) natural narration that can be spoken aloud, and (3) a complete standalone SVG visualization of the whiteboard state at that exact step.\n" +
    "Rules for the lesson:\n" +
    "- Progress logically from simple to advanced; each step introduces or modifies ONE important idea.\n" +
    "- A lesson should generally contain 4-10 steps depending on topic complexity; do not pad simple topics, and do not put everything into one SVG — each step gets its own SVG.\n" +
    "- Keep narration to 1-3 concise, natural spoken sentences that explain exactly what is shown in the current step's SVG. The narration and SVG MUST correspond: never describe an element that is not in the SVG, and never draw something you don't explain.\n" +
    "- Keep visual identity consistent across steps: when an object continues across steps, keep its position and appearance stable; use highlights, arrows, labels, and faded/crossed-out elements to communicate changes.\n" +
    "- Prioritize clarity and educational value over decoration.\n" +
    "SVG rules:\n" +
    "- Every SVG must be complete and standalone, beginning with: <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 800 500\">\n" +
    "- Use only SVG primitives: rect, circle, ellipse, line, polyline, polygon, path, text, g.\n" +
    "- Never use scripts, event handlers, images, external URLs, iframes, or objects. No external dependencies between steps.\n" +
    "- Keep diagrams readable and focused; avoid enormous SVGs with thousands of elements.",
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
  const teacherMode = Boolean(body.teacherMode);
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
          case "vfs":
            emit({ t: "vfs", files: evt.snapshot });
            break;
          case "diagram":
            emit({ t: "diagram", diagram: evt.diagram });
            break;
          case "teacher_lesson":
            emit({ t: "teacher_lesson", lesson: evt.lesson });
            break;
          case "download":
            emit({ t: "download", filename: evt.filename, dataUrl: evt.dataUrl, size: evt.size });
            break;
          case "clear_content":
            emit({ t: "clear_content" });
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
        // generate_diagram is always available so any answer can include a
        // visual diagram.
        createDiagramTool(agentEmit),
        // In AI Teacher Mode, the agent can build a step-by-step SVG lesson.
        ...(teacherMode ? [createTeacherLessonTool(agentEmit)] : []),
        // read_url is available in any conversation, independent of the search
        // toggle (reading a link isn't the same as web search).
        ...(conversationId ? [...READ_TOOLS, ...createVfsTools(vfs, agentEmit)] : []),
      ];

      try {
        if (tools.length > 0) {
          const hints: ChatCompletionMessageParam[] = [];
          if (searchEnabled) hints.push(SEARCH_HINT);
          if (conversationId) hints.push(VFS_HINT);
          if (teacherMode) hints.push(TEACHER_HINT);
          hints.push(DIAGRAM_HINT);
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
