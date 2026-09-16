import { AppError } from "@/lib/errors";

/** First-byte timeout for provider requests. */
export const PROVIDER_CONNECT_TIMEOUT_MS = 45_000;
/** Overall cap on a single streamed generation. */
export const PROVIDER_STREAM_TIMEOUT_MS = 5 * 60_000;

/**
 * Combines the caller's abort signal with connect + total timeouts.
 * `markStarted()` should be called once the first byte arrives so the connect
 * timer no longer applies.
 */
export function providerSignal(external?: AbortSignal) {
  const controller = new AbortController();
  let reason: "timeout" | "external" | null = null;

  const connectTimer = setTimeout(() => { reason = "timeout"; controller.abort(); }, PROVIDER_CONNECT_TIMEOUT_MS);
  const totalTimer = setTimeout(() => { reason = "timeout"; controller.abort(); }, PROVIDER_STREAM_TIMEOUT_MS);

  const onExternalAbort = () => { reason = "external"; controller.abort(); };
  if (external) {
    if (external.aborted) onExternalAbort();
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    markStarted: () => clearTimeout(connectTimer),
    cleanup: () => {
      clearTimeout(connectTimer);
      clearTimeout(totalTimer);
      external?.removeEventListener("abort", onExternalAbort);
    },
    get reason() { return reason; },
  };
}

/** Maps a non-2xx provider response to a user-safe AppError. */
export async function providerHttpError(res: Response, providerLabel: string): Promise<AppError> {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
      const msg = typeof json.error === "string" ? json.error : json.error?.message ?? json.message;
      detail = typeof msg === "string" ? msg : "";
    } catch {
      detail = text.slice(0, 200);
    }
  } catch { /* ignore */ }

  detail = detail.replace(/\s+/g, " ").trim().slice(0, 240);
  const suffix = detail ? ` (${detail})` : "";

  if (res.status === 401 || res.status === 403) {
    return new AppError("provider_auth", `${providerLabel} rejected the API key. Check the key in your environment configuration.${suffix}`);
  }
  if (res.status === 429) {
    return new AppError("provider_rate_limit", `${providerLabel} is rate-limiting requests right now. Wait a moment and try again.${suffix}`);
  }
  if (res.status === 400 || res.status === 404 || res.status === 422) {
    return new AppError("provider_error", `${providerLabel} rejected the request.${suffix}`);
  }
  if (res.status >= 500) {
    return new AppError("provider_error", `${providerLabel} returned a server error. Please try again.${suffix}`);
  }
  return new AppError("provider_error", `${providerLabel} returned an unexpected response (${res.status}).${suffix}`);
}

export function wrapFetchError(err: unknown, timedOut: boolean): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error && err.name === "AbortError") {
    return timedOut
      ? new AppError("provider_timeout", "The AI provider took too long to respond. Please try again.")
      : new AppError("provider_timeout", "Generation was stopped.");
  }
  return new AppError("network", "Couldn't reach the AI provider. Check the network connection and base URL, then try again.");
}

/**
 * Reads a Server-Sent-Events body and yields the `data:` payload of each event.
 */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      // Events are separated by a blank line.
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, "");
        const data = raw
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data) yield data;
      }
    }
    // Flush any trailing event without a terminating blank line.
    const tail = buffer.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** Collects a streamed generator into a single string. */
export async function collect(gen: AsyncGenerator<string, void, undefined>): Promise<string> {
  let out = "";
  for await (const chunk of gen) out += chunk;
  return out;
}
