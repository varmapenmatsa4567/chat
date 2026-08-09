// read_url tool — fetches and returns the readable text content of a web page
// via the Jina Reader service (https://r.jina.ai/<url>). Server-side, so no CORS
// issues. Read-only; output is capped to keep the model's context reasonable.

import type { AgentTool } from "../types";

const MAX_CONTENT_CHARS = 8000;
const TIMEOUT_MS = 12000;

// Allow only public http(s) URLs — blocks localhost and private/internal hosts
// (SSRF guard) so the server never fetches internal addresses.
function isAllowedUrl(raw: string): { ok: boolean; url?: string; error?: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "Only http:// and https:// URLs are supported" };
  }

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, error: "localhost URLs are not allowed" };
  }

  // Numeric IPv4 — block private/loopback/link-local ranges.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b, c] = host.split(".").map(Number);
    const blocked =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
    if (blocked) {
      return { ok: false, error: "Private or internal IP addresses are not allowed" };
    }
  }

  return { ok: true, url: u.toString() };
}

export const readUrlTool: AgentTool = {
  definition: {
    type: "function",
    function: {
      name: "read_url",
      description:
        "Fetch and read the full readable text content of a web page or article at the given URL. Use this when the user shares a link and wants it summarized or answered from, or when you need the contents of a specific page.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The full http(s) URL to read" },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  run: async (args) => {
    const check = isAllowedUrl(String(args.url ?? ""));
    if (!check.ok) {
      return JSON.stringify({ error: check.error, content: "" });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`https://r.jina.ai/${check.url}`, {
        signal: controller.signal,
        headers: { Accept: "text/plain" },
      });
      clearTimeout(timer);
      if (!res.ok) {
        return JSON.stringify({ error: `Reader request failed (${res.status})`, content: "" });
      }
      const text = await res.text();
      const truncated = text.length > MAX_CONTENT_CHARS;
      return JSON.stringify({
        success: true,
        url: check.url,
        content: text.slice(0, MAX_CONTENT_CHARS),
        length: text.length,
        truncated,
      });
    } catch (err) {
      clearTimeout(timer);
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        content: "",
      });
    }
  },
};
