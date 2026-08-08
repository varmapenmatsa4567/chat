// Tavily search API — returns clean snippets + source links for the AI to use.
// Requires a TAVILY_API_KEY (https://tavily.com).

export type TavilyResult = { title: string; url: string; content: string };

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export async function tavilySearch(
  query: string,
  apiKey: string,
  maxResults = 5
): Promise<TavilyResult[]> {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily request failed (${res.status})`);
  }

  const data = await res.json();
  const results: TavilyResult[] = (data.results ?? []).map(
    (r: { title?: string; url?: string; content?: string }) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      // Keep each snippet compact so the model gets signal without bloating the
      // context window.
      content: (r.content ?? "").slice(0, 2000),
    })
  );

  return results.filter((r) => r.url);
}
