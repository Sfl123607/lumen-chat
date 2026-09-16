import { env, getProviderName, type ProviderName } from "@/lib/env";
import type { ModelTier, ModelTierInfo } from "@/types";

/**
 * Default model ids per provider and tier. Override with MODEL_FAST /
 * MODEL_BALANCED / MODEL_ADVANCED. Verify ids against your provider's
 * current model list — they change over time.
 */
const DEFAULTS: Record<ProviderName, Record<ModelTier, string>> = {
  openai: { fast: "gpt-5-mini", balanced: "gpt-5", advanced: "gpt-5" },
  anthropic: { fast: "claude-haiku-4-5-20251001", balanced: "claude-sonnet-5", advanced: "claude-opus-5" },
  gemini: { fast: "gemini-2.5-flash", balanced: "gemini-2.5-flash", advanced: "gemini-2.5-pro" },
};

const LABELS: Record<ModelTier, { label: string; description: string }> = {
  fast: { label: "Fast", description: "Quickest replies, good for simple tasks" },
  balanced: { label: "Balanced", description: "Good quality for everyday questions" },
  advanced: { label: "Advanced", description: "Strongest reasoning, slower" },
};

export function resolveModel(tier: ModelTier): string {
  const provider = getProviderName();
  const override = tier === "fast" ? env.modelFast : tier === "balanced" ? env.modelBalanced : env.modelAdvanced;
  return override || DEFAULTS[provider][tier];
}

export function listTiers(): ModelTierInfo[] {
  const tiers: ModelTier[] = ["fast", "balanced", "advanced"];
  return tiers.map((tier) => ({ tier, model: resolveModel(tier), ...LABELS[tier] }));
}

/** Token budget for the conversation context sent to the model. */
export function contextTokenBudget(): number {
  return env.contextTokenBudget;
}
