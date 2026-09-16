import type { LLMProvider } from "@/lib/ai/types";

const MAX_TITLE = 60;

/** Cheap fallback used before (or instead of) the model-generated title. */
export function fallbackTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, " ").replace(/[`*_#>]/g, "").trim();
  if (!cleaned) return "New chat";
  if (cleaned.length <= MAX_TITLE) return cleaned;
  const cut = cleaned.slice(0, MAX_TITLE);
  return `${cut.slice(0, Math.max(20, cut.lastIndexOf(" ")))}…`;
}

/** Asks the model for a short title. Returns null on failure so callers can keep the fallback. */
export async function generateTitle(provider: LLMProvider, model: string, userMessage: string, assistantReply: string): Promise<string | null> {
  try {
    const text = await provider.complete(
      [
        {
          role: "user",
          content:
            `Write a short title (3–6 words, no quotes, no trailing punctuation, Title Case) for a chat that starts like this.\n\n` +
            `User: ${userMessage.slice(0, 1500)}\n\nAssistant: ${assistantReply.slice(0, 800)}\n\nTitle:`,
        },
      ],
      { model, system: "You write concise, descriptive chat titles. Reply with the title only.", temperature: 0.3, maxTokens: 24 },
    );
    const title = text.split("\n")[0]?.replace(/^["'“”]+|["'“”.]+$/g, "").replace(/^title:\s*/i, "").trim() ?? "";
    if (!title || title.length > 80) return null;
    return title;
  } catch (err) {
    console.warn("[title] generation failed", err);
    return null;
  }
}
