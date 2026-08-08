// OpenAI-compatible providers the user can bring their own key for.
export type KnownProvider = {
  key: string;
  name: string;
  baseURL: string;
  defaultModel: string;
  description?: string;
  icon?: string;
  popularModels?: string[];
};

export const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    key: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    description: "Industry-standard models from OpenAI (GPT-4o, GPT-4o-mini, o1).",
    icon: "⚡",
    popularModels: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini", "gpt-4-turbo"],
  },
  {
    key: "groq",
    name: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    description: "Ultra-fast LPUs powering open-weights Llama and Mixtral models.",
    icon: "🚀",
    popularModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o",
    description: "Unified gateway routing to 100+ state-of-the-art AI models.",
    icon: "🌐",
    popularModels: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "deepseek/deepseek-r1", "google/gemini-2.0-flash-exp:free"],
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    description: "Reasoning and coding models with exceptional benchmark performance.",
    icon: "🧠",
    popularModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    key: "mistral",
    name: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    description: "Frontier European open and commercial models.",
    icon: "🌪️",
    popularModels: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
  },
  {
    key: "gemini",
    name: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.0-flash",
    description: "Google's multimodal Gemini models with massive context windows.",
    icon: "✨",
    popularModels: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  },
  {
    key: "xai",
    name: "xAI (Grok)",
    baseURL: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    description: "Grok models from xAI with real-time knowledge capabilities.",
    icon: "🪐",
    popularModels: ["grok-2-latest", "grok-2-vision-latest"],
  },
  {
    key: "opencode-zen",
    name: "Opencode Zen",
    baseURL: "https://opencode.ai/zen/v1",
    defaultModel: "mimo-v2.5-free",
    description: "High-speed free & community AI inference tier.",
    icon: "🍃",
    popularModels: ["mimo-v2.5-free"],
  },
];

// A user's saved provider config (their own base URL + API key).
export type ProviderConfig = {
  id: string;
  label: string;
  baseURL: string;
  apiKey: string;
  createdAt: number;
};

// Return a friendly name for a provider
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

export function getProviderIcon(baseURL?: string): string {
  if (!baseURL) return "✨";
  const known = KNOWN_PROVIDERS.find(
    (k) => k.baseURL === baseURL || baseURL.startsWith(k.baseURL)
  );
  return known?.icon ?? "🔌";
}
