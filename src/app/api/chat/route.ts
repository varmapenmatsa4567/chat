import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";

type ProviderInfo = {
  baseURL?: string;
  model?: string;
  apiKey?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    messages: ChatCompletionMessageParam[];
    provider?: ProviderInfo;
  };
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

  const client = new OpenAI({ baseURL, apiKey });

  let stream: Awaited<ReturnType<typeof client.chat.completions.create>>;
  try {
    stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
    });
  } catch (err) {
    const status =
      typeof (err as { status?: unknown })?.status === "number"
        ? (err as { status: number }).status
        : 500;
    const message =
      status === 429
        ? "Rate limited (429) by the provider. Please wait a moment and try again."
        : status === 401
          ? "Invalid API key or unauthorized (401). Check the provider's API key."
          : status === 404
            ? `Model not found (404). Check the model name for "${baseURL}".`
            : ((err as { message?: string })?.message ??
              "Provider request failed.");
    return new Response(message, { status });
  }

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
