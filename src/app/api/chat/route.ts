import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { runAgent } from "../../../lib/agent/run";
import { AGENT_TOOLS } from "../../../lib/agent/tools";

export const runtime = "nodejs";

type ProviderInfo = {
  baseURL?: string;
  model?: string;
  apiKey?: string;
};

type ChatRequestBody = {
  messages: ChatCompletionMessageParam[];
  provider?: ProviderInfo;
  searchEnabled?: boolean;
};

// Tells the model it may search the web when the answer could be current info.
const SEARCH_HINT: ChatCompletionMessageParam = {
  role: "system",
  content:
    "You are a helpful assistant. You may use the web_search tool when the user asks about current events, recent news, live data, or anything you are not confident about. Prefer searching when the information may have changed or you do not know it.",
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequestBody;
  const { messages } = body;

  // Use the user's provider if supplied, otherwise fall back to the default.
  const baseURL = body.provider?.baseURL || "https://opencode.ai/zen/v1";
  const apiKey = body.provider?.apiKey || process.env.OPENAI_API_KEY;
  const model = body.provider?.model || "mimo-v2.5-free";

  if (!apiKey) {
    return new Response("Missing API key for the selected provider", {
      status: 500,
    });
  }

  // Whether the agent may call the web_search tool this turn.
  const searchEnabled = Boolean(body.searchEnabled);

  const client = new OpenAI({ baseURL, apiKey });
  const encoder = new TextEncoder();

  // NDJSON stream: one JSON event per line, so the client can show search
  // status, stream the final answer, and render source links.
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        if (searchEnabled) {
          // Prepend the search hint so the model knows it can look things up.
          const history: ChatCompletionMessageParam[] = [SEARCH_HINT, ...messages];
          await runAgent({
            model,
            baseURL,
            apiKey,
            messages: history,
            tools: AGENT_TOOLS,
            onEvent: (evt) => {
              switch (evt.type) {
                case "content":
                  emit({ t: "content", d: evt.text });
                  break;
                case "status":
                  emit({ t: "status", s: evt.status, q: evt.query });
                  break;
                case "sources":
                  emit({ t: "sources", urls: evt.sources });
                  break;
                case "error":
                  emit({ t: "error", d: evt.message });
                  break;
                case "done":
                  emit({ t: "done" });
                  break;
              }
            },
          });
        } else {
          // Plain streaming path (unchanged behavior, just framed as NDJSON).
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
