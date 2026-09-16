import { env } from "@/lib/env";
import type { ChatMessage, GenerateOptions, LLMProvider } from "@/lib/ai/types";
import { collect, providerHttpError, providerSignal, readSSE, wrapFetchError } from "@/lib/ai/http";

interface AnthropicStreamEvent {
  type: string;
  delta?: { type?: string; text?: string };
  error?: { type?: string; message?: string };
}

/** Anthropic Messages API (streaming). */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  private toAnthropicMessages(messages: ChatMessage[]) {
    // Anthropic requires alternating user/assistant turns and a user turn first.
    const out: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const m of messages) {
      if (m.role === "system") continue;
      const last = out[out.length - 1];
      if (last && last.role === m.role) {
        last.content += `\n\n${m.content}`;
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }
    if (out[0]?.role === "assistant") out.unshift({ role: "user", content: "(conversation continues)" });
    return out;
  }

  async *stream(messages: ChatMessage[], options: GenerateOptions): AsyncGenerator<string, void, undefined> {
    const ctl = providerSignal(options.signal);
    try {
      let res: Response;
      try {
        res = await fetch(`${env.anthropicBaseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: options.model,
            system: options.system,
            messages: this.toAnthropicMessages(messages),
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            stream: true,
          }),
          signal: ctl.signal,
        });
      } catch (err) {
        throw wrapFetchError(err, ctl.reason === "timeout");
      }
      if (!res.ok) throw await providerHttpError(res, "Anthropic");
      if (!res.body) throw wrapFetchError(new Error("empty body"), false);
      ctl.markStarted();

      for await (const data of readSSE(res.body)) {
        let evt: AnthropicStreamEvent;
        try { evt = JSON.parse(data) as AnthropicStreamEvent; } catch { continue; }
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
          yield evt.delta.text;
        } else if (evt.type === "error") {
          throw wrapFetchError(new Error(evt.error?.message ?? "stream error"), false);
        } else if (evt.type === "message_stop") {
          return;
        }
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
