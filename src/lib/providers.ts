// OpenAI-compatible providers the user can bring their own key for.
// All expose a Chat Completions API, so they work with the `openai` SDK
// via a custom base URL.
export type KnownProvider = {
  key: string;
  name: string;
  baseURL: string;
  defaultModel: string;
};

export const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    key: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
  },
  {
    key: "groq",
    name: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o",
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  {
    key: "mistral",
    name: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
  },
  {
    key: "gemini",
    name: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.0-flash",
  },
  {
    key: "xai",
    name: "xAI (Grok)",
    baseURL: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
  },
  {
    key: "opencode-zen",
    name: "Opencode Zen",
    baseURL: "https://opencode.ai/zen/v1",
    defaultModel: "mimo-v2.5-free",
  },
];

// A user's saved provider config (their own base URL + API key).
// The model is chosen separately at selection time, per provider.
export type ProviderConfig = {
  id: string;
  label: string;
  baseURL: string;
  apiKey: string;
  createdAt: number;
};

// Return a friendly name for a provider, preferring the known provider's name
// over a raw base URL. Falls back to the saved label, then the base URL.
export function providerDisplayName(p: {
  label: string;
  baseURL: string;
}): string {
  const known = KNOWN_PROVIDERS.find(
    (k) =>
      k.baseURL === p.baseURL ||
      p.baseURL.startsWith(k.baseURL) ||
      k.baseURL.startsWith(p.baseURL)
  );
  if (p.label && p.label.trim() && p.label !== p.baseURL && !p.label.includes("://")) {
    return p.label;
  }
  return known?.name ?? (p.label && p.label.trim() ? p.label : p.baseURL);
}
