/**
 * Server-side environment access. Never import this from client components.
 * Values are read lazily so the app can boot (and show a setup message)
 * even when the AI provider is not configured yet.
 */

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = Number.parseInt(str(name), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export type ProviderName = "openai" | "anthropic" | "gemini";

export function getProviderName(): ProviderName {
  const raw = str("AI_PROVIDER", "openai").toLowerCase();
  if (raw === "anthropic" || raw === "gemini" || raw === "openai") return raw;
  return "openai";
}

export const env = {
  get provider(): ProviderName {
    return getProviderName();
  },
  get openaiKey() { return str("OPENAI_API_KEY"); },
  get openaiBaseUrl() { return str("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/+$/, ""); },
  get anthropicKey() { return str("ANTHROPIC_API_KEY"); },
  get anthropicBaseUrl() { return str("ANTHROPIC_BASE_URL", "https://api.anthropic.com").replace(/\/+$/, ""); },
  get geminiKey() { return str("GEMINI_API_KEY"); },
  get geminiBaseUrl() { return str("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, ""); },
  get modelFast() { return str("MODEL_FAST"); },
  get modelBalanced() { return str("MODEL_BALANCED"); },
  get modelAdvanced() { return str("MODEL_ADVANCED"); },
  get contextTokenBudget() { return int("AI_CONTEXT_TOKEN_BUDGET", 24000); },
  get supabaseUrl() { return str("NEXT_PUBLIC_SUPABASE_URL"); },
  get supabaseAnonKey() { return str("NEXT_PUBLIC_SUPABASE_ANON_KEY"); },
  get dataDir() { return str("DATA_DIR", "./data"); },
  get rateLimitChatPerMinute() { return int("RATE_LIMIT_CHAT_PER_MINUTE", 20); },
  get rateLimitApiPerMinute() { return int("RATE_LIMIT_API_PER_MINUTE", 240); },
  get maxMessageChars() { return int("MAX_MESSAGE_CHARS", 12000); },
};

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

/** Returns the API key for the active provider, or "" when unset. */
export function activeProviderKey(): string {
  switch (getProviderName()) {
    case "anthropic": return env.anthropicKey;
    case "gemini": return env.geminiKey;
    default: return env.openaiKey;
  }
}

export function isAIConfigured(): boolean {
  return activeProviderKey().length > 0;
}

export function aiSetupMessage(): string | null {
  if (isAIConfigured()) return null;
  const provider = getProviderName();
  const keyName = provider === "anthropic" ? "ANTHROPIC_API_KEY" : provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY";
  return `The assistant can't respond yet: no API key is configured for the "${provider}" provider. Copy .env.example to .env.local, set ${keyName} (and AI_PROVIDER if you want a different provider), then restart the server.`;
}
