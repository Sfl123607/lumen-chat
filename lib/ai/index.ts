import { getProviderName, isAIConfigured, aiSetupMessage } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { LLMProvider } from "@/lib/ai/types";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { GeminiProvider } from "@/lib/ai/providers/gemini";

let cached: { name: string; provider: LLMProvider } | null = null;

/** Returns the configured provider, or throws a user-safe "not configured" error. */
export function getProvider(): LLMProvider {
  if (!isAIConfigured()) {
    throw new AppError("not_configured", aiSetupMessage() ?? "The AI provider is not configured.");
  }
  const name = getProviderName();
  if (cached?.name === name) return cached.provider;
  const provider: LLMProvider =
    name === "anthropic" ? new AnthropicProvider() : name === "gemini" ? new GeminiProvider() : new OpenAIProvider();
  cached = { name, provider };
  return provider;
}
