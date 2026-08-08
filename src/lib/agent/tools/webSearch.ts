// web_search tool: the model calls this when it needs current/real-world info.
// Add future tools as new files in this directory and register them in
// src/lib/agent/tools/index.ts.

import type { AgentTool } from "../types";
import { tavilySearch } from "../../tavily";

export const webSearchTool: AgentTool = {
  definition: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current, up-to-date, or factual information that you don't already know. Use this for recent events, live data, news, or anything you're unsure about. Returns a list of relevant snippets with source URLs.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up on the web.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  run: async (args) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return JSON.stringify({
        error: "Web search is not configured (missing TAVILY_API_KEY).",
        results: [],
      });
    }
    const query = String(args.query ?? "").trim();
    if (!query) {
      return JSON.stringify({ error: "Empty search query.", results: [] });
    }
    const results = await tavilySearch(query, apiKey);
    // Compact representation the model reads as context; also used by the agent
    // loop to surface source links.
    return JSON.stringify({ query, results });
  },
};
