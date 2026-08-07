import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { baseURL, apiKey } = (await request.json()) as {
    baseURL?: string;
    apiKey?: string;
  };

  if (!baseURL || !apiKey) {
    return Response.json({ error: "Missing baseURL or apiKey" }, { status: 400 });
  }

  try {
    const client = new OpenAI({ baseURL, apiKey });
    const list = await client.models.list();
    const models = list.data
      .map((m) => m.id)
      .filter(Boolean)
      .sort();
    return Response.json({ models });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch models from provider",
      },
      { status: 400 }
    );
  }
}
