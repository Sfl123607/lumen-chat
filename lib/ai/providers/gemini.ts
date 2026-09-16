import { env } from "@/lib/env";
import type { ChatMessage, GenerateOptions, LLMProvider } from "@/lib/ai/types";
import { collect, providerHttpError, providerSignal, readSSE, wrapFetchError } from "@/lib/ai/http";

interface GeminiChunk {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

/** Google Gemini generateContent API (streaming via SSE). */
export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  private toContents(messages: ChatMessage[]) {
    return messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  }

  async *stream(messages: ChatMessage[], options: GenerateOptions): AsyncGenerator<string, void, undefined> {
    const ctl = providerSignal(options.signal);
    try {
      const url = `${env.geminiBaseUrl}/models/${encodeURIComponent(options.model)}:streamGenerateContent?alt=sse`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: options.system }] },
            contents: this.toContents(messages),
            generationConfig: { temperature: options.temperature, maxOutputTokens: options.maxTokens },
          }),
          signal: ctl.signal,
        });
      } catch (err) {
        throw wrapFetchError(err, ctl.reason === "timeout");
      }
      if (!res.ok) throw await providerHttpError(res, "Gemini");
      if (!res.body) throw wrapFetchError(new Error("empty body"), false);
      ctl.markStarted();

      for await (const data of readSSE(res.body)) {
        let chunk: GeminiChunk;
        try { chunk = JSON.parse(data) as GeminiChunk; } catch { continue; }
        if (chunk.error?.message) throw wrapFetchError(new Error(chunk.error.message), false);
        if (chunk.promptFeedback?.blockReason) {
          throw wrapFetchError(new Error(`Blocked by safety filter (${chunk.promptFeedback.blockReason})`), false);
        }
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const p of parts) if (p.text) yield p.text;
      }
    } catch (err) {
      throw wrapFetchError(err, ctl.reason === "timeout");
    } finally {
      ctl.cleanup();
    }
  }

  async complete(messages: ChatMessage[], options: GenerateOptions): Promise<string> {
    return collect(this.stream(messages, options));
  }
}
