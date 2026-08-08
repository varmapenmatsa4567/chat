// Streaming agent loop. Runs the model over the history, lets it call tools
// (e.g. web_search), feeds the results back, and streams the final answer.
// Falls back to a plain (no-tools) completion if the provider/model can't do
// tool-calling — so even free-tier models keep working.

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { AgentRunOptions, AgentStreamEvent, SearchSource } from "./types";

const MAX_ITERATIONS = 4;

// Detect providers/models that reject the `tools` parameter so we can retry
// once without tools instead of crashing.
function isToolError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lowered = msg.toLowerCase();
  return (
    /(tool|function)/.test(lowered) &&
    /(unsupported|not supported|does not support|unknown parameter|invalid|400|not allowed)/.test(
      lowered
    )
  );
}

export async function runAgent(opts: AgentRunOptions): Promise<{
  content: string;
  sources: SearchSource[];
}> {
  const client = new OpenAI({
    baseURL: opts.baseURL,
    apiKey: opts.apiKey,
  });

  const tools: ChatCompletionTool[] = opts.tools.map((t) => t.definition);
  const history: ChatCompletionMessageParam[] = [...opts.messages];
  const sources: SearchSource[] = [];
  let toolsSupported = tools.length > 0;
  const maxIterations = opts.maxIterations ?? MAX_ITERATIONS;

  let finalContent = "";

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let stream;
    try {
      stream = await client.chat.completions.create({
        model: opts.model,
        messages: history,
        stream: true,
        ...(toolsSupported ? { tools, tool_choice: "auto" as const } : {}),
      });
    } catch (err) {
      if (toolsSupported && isToolError(err)) {
        // Retry once without tools — model/provider can't call them.
        toolsSupported = false;
        continue;
      }
      throw err;
    }

    let content = "";
    const toolCalls: { id: string; name: string; arguments: string }[] = [];
    const indexToArray = new Map<number, number>();

    // Content is buffered per-turn and only forwarded to the client when the
    // turn is a content-only (final) turn. Tool-call turns can stream junk in
    // `delta.content` on some providers (e.g. the literal string "[object
    // Object]"); we discard that so it never reaches the UI.
    const turnContent: string[] = [];

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (typeof delta?.content === "string" && delta.content) {
          content += delta.content;
          turnContent.push(delta.content);
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            let i = indexToArray.get(tc.index);
            if (i === undefined) {
              i = toolCalls.length;
              indexToArray.set(tc.index, i);
              toolCalls[i] = { id: "", name: "", arguments: "" };
            }
            if (tc.id) toolCalls[i].id = tc.id;
            if (tc.function?.name) toolCalls[i].name += tc.function.name;
            if (tc.function?.arguments) toolCalls[i].arguments += tc.function.arguments;
          }
        }
      }
    } catch (err) {
      throw err;
    }

    // If the model decided to call tools, execute them and loop for the answer.
    if (toolCalls.length > 0) {
      history.push({
        role: "assistant",
        content: content || null,
        tool_calls: toolCalls.map((c) => ({
          id: c.id,
          type: "function" as const,
          function: { name: c.name, arguments: c.arguments },
        })),
      });

      for (const call of toolCalls) {
        const tool = opts.tools.find(
          (t) => t.definition.function?.name === call.name
        );

        if (call.name === "web_search") {
          let query = "";
          try {
            query = String((JSON.parse(call.arguments || "{}").query ?? "").trim());
          } catch {
            query = "";
          }
          opts.onEvent({
            type: "status",
            status: "searching",
            query: query || undefined,
          });
        }

        let output: string;
        if (!tool) {
          output = JSON.stringify({ error: `Unknown tool: ${call.name}` });
        } else {
          let args: Record<string, unknown> = {};
          try {
            args = call.arguments ? JSON.parse(call.arguments) : {};
          } catch {
            args = {};
          }
          try {
            output = await tool.run(args);
          } catch (err) {
            output = JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        history.push({ role: "tool", tool_call_id: call.id, content: output });

        if (call.name === "web_search") {
          try {
            const parsed = JSON.parse(output);
            const srcs: SearchSource[] = (parsed.results ?? [])
              .filter((r: { url?: string; title?: string }) => r.url)
              .map((r: { url: string; title?: string }) => ({
                title: r.title ?? r.url,
                url: r.url,
              }));
            if (srcs.length) {
              sources.push(...srcs);
              opts.onEvent({ type: "sources", sources: srcs });
            }
          } catch {
            // ignore malformed tool output; the model still sees it
          }
        }
      }

      continue; // one more turn to produce the final answer
    }

    // No tool calls this turn → final answer. Forward the buffered content now.
    for (const t of turnContent) {
      opts.onEvent({ type: "content", text: t });
    }
    finalContent = content;
    break;
  }

  opts.onEvent({ type: "done" });
  return { content: finalContent, sources };
}
