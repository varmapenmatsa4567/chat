import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { messages } = (await request.json()) as {
    messages: ChatCompletionMessageParam[];
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("Missing OPENAI_API_KEY in .env", { status: 500 });
  }

  // Config for the OpenAI-compatible endpoint
  const client = new OpenAI({
    baseURL: "https://opencode.ai/zen/v1",
    apiKey,
  });

  const stream = await client.chat.completions.create({
    // model: "mimo-v2.5-free",
    model: "ling-3.0-flash-free",
    messages,
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
