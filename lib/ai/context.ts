import type { Conversation, Message } from "@/types";
import type { ChatMessage, LLMProvider } from "@/lib/ai/types";
import { SUMMARY_PREFIX } from "@/lib/ai/system-prompt";
import { contextTokenBudget } from "@/lib/ai/config";

/** Rough token estimate (≈4 chars/token for English, conservative for code). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}

/** Never summarize away the most recent N messages. */
const KEEP_RECENT = 8;
/** Cap the rolling summary so it can't itself grow without bound. */
const MAX_SUMMARY_CHARS = 6000;

export interface BuiltContext {
  messages: ChatMessage[];
  /** Updated summary state to persist, or null when nothing changed. */
  summaryUpdate: { summary: string; summaryThrough: string } | null;
}

/**
 * Builds the message list for the model.
 *
 * Messages already covered by the conversation summary are replaced with the
 * summary. If the remaining messages still exceed the budget, the older ones
 * (beyond the last KEEP_RECENT) are summarized with a non-streaming call and
 * folded into the rolling summary. On any failure we fall back to truncation
 * so a summarization hiccup never blocks the reply.
 */
export async function buildContext(
  conversation: Conversation,
  history: Message[],
  provider: LLMProvider,
  model: string,
  systemPrompt: string,
): Promise<BuiltContext> {
  const budget = contextTokenBudget();
  let summary = conversation.summary ?? "";
  let summaryThrough = conversation.summaryThrough ?? null;

  // Messages not yet covered by the summary.
  let live = summaryThrough
    ? history.filter((m) => m.createdAt > summaryThrough!)
    : history.slice();

  const cost = (msgs: Message[]) =>
    estimateTokens(systemPrompt) + estimateTokens(summary) + msgs.reduce((n, m) => n + estimateTokens(m.content) + 4, 0);

  let summaryUpdate: BuiltContext["summaryUpdate"] = null;

  if (cost(live) > budget && live.length > KEEP_RECENT) {
    const toSummarize = live.slice(0, live.length - KEEP_RECENT);
    const remaining = live.slice(live.length - KEEP_RECENT);
    try {
      const transcript = toSummarize
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n")
        .slice(0, 60_000);
      const prompt: ChatMessage[] = [
        {
          role: "user",
          content:
            (summary ? `Existing summary:\n${summary}\n\n` : "") +
            `New conversation excerpt to fold into the summary:\n\n${transcript}\n\n` +
            "Write an updated, compact summary (under 350 words) of everything important so far: the user's goals, key facts, decisions, code or names mentioned, and any open questions. Plain prose or short bullets, no preamble.",
        },
      ];
      const text = (
        await provider.complete(prompt, {
          model,
          system: "You summarize conversations faithfully and concisely for later context. Never invent details.",
          temperature: 0.2,
          maxTokens: 700,
        })
      ).trim();
      if (text) {
        summary = text.slice(0, MAX_SUMMARY_CHARS);
        summaryThrough = toSummarize[toSummarize.length - 1]!.createdAt;
        summaryUpdate = { summary, summaryThrough };
        live = remaining;
      }
    } catch (err) {
      console.warn("[context] summarization failed, falling back to truncation", err);
    }
  }

  // Final safety net: drop oldest live messages until we fit (always keep the last one).
  while (cost(live) > budget && live.length > 1) live = live.slice(1);

  const messages: ChatMessage[] = [];
  if (summary) messages.push({ role: "user", content: `${SUMMARY_PREFIX}\n\n${summary}` }, { role: "assistant", content: "Understood. I'll keep that context in mind." });
  for (const m of live) {
    if (m.role === "system") continue;
    if (!m.content.trim()) continue;
    messages.push({ role: m.role, content: m.content });
  }
  return { messages, summaryUpdate };
}
