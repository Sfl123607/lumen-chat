export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  model: string;
  /** System instructions. Sent via the provider's native mechanism. */
  system: string;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly name: string;
  /** Streams text deltas. Throws AppError on failure before or during the stream. */
  stream(messages: ChatMessage[], options: GenerateOptions): AsyncGenerator<string, void, undefined>;
  /** Convenience non-streaming call used for titles and summaries. */
  complete(messages: ChatMessage[], options: GenerateOptions): Promise<string>;
}
