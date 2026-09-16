import { env } from "@/lib/env";
import type { ChatMessage, GenerateOptions, LLMProvider } from "@/lib/ai/types";
import { collect, providerHttpError, providerSignal, readSSE, wrapFetchError } from "@/lib/ai/http";

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
  error?: { message?: string };
}

/**
 * Works with OpenAI and any OpenAI-compatible /chat/completions endpoint
 * (Groq, Together, OpenRouter, Ollama, LM Studio, vLLM ...).
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";

  private async request(messages: ChatMessage[], options: GenerateOptions, stream: boolean, signal: AbortSignal) {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: [{ role: "system", content: options.system }, ...messages],
      max_completion_tokens: options.maxTokens,
      stream,
    };
    // OpenAI reasoning models (gpt-5*, o*) reject a custom temperature; other models accept it.
    if (!/^(gpt-5|o\d)/i.test(options.model)) body.temperature = options.temperature;
    return fetch(`${env.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  async *stream(messages: ChatMessage[], options: GenerateOptions): AsyncGenerator<string, void, undefined> {
    const ctl = providerSignal(options.signal);
    try {
      let res: Response;
      try {
        res = await this.request(messages, options, true, ctl.signal);
      } catch (err) {
        throw wrapFetchError(err, ctl.reason === "timeout");
      }
      if (!res.ok) throw await providerHttpError(res, "OpenAI");
      if (!res.body) throw wrapFetchError(new Error("empty body"), false);
      ctl.markStarted();

      for await (const data of readSSE(res.body)) {
        if (data === "[DONE]") return;
        let chunk: ChatCompletionChunk;
        try { chunk = JSON.parse(data) as ChatCompletionChunk; } catch { continue; }
        if (chunk.error?.message) throw wrapFetchError(new Error(chunk.error.message), false);
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
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
