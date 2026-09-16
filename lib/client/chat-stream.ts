import type { ChatRequestBody, ChatStreamEvent } from "@/types";
import { readErrorResponse } from "@/lib/client/api";

export interface StreamHandlers {
  onMeta: (evt: Extract<ChatStreamEvent, { type: "meta" }>) => void;
  onDelta: (text: string) => void;
  onDone: (evt: Extract<ChatStreamEvent, { type: "done" }>) => void;
  onError: (code: string, message: string) => void;
}

/**
 * Calls POST /api/chat and dispatches the NDJSON events. Resolves when the
 * stream ends. Aborting `signal` stops generation; the text already received
 * is kept by both client and server.
 */
export async function streamChat(body: ChatRequestBody, signal: AbortSignal, handlers: StreamHandlers): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") { handlers.onDone({ type: "done", stopped: true }); return; }
    handlers.onError("network", "You appear to be offline. Check your connection and try again.");
    return;
  }

  if (!res.ok || !res.body) {
    const e = await readErrorResponse(res);
    handlers.onError(e.code, e.message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let evt: ChatStreamEvent;
    try { evt = JSON.parse(line) as ChatStreamEvent; } catch { return; }
    switch (evt.type) {
      case "meta": handlers.onMeta(evt); break;
      case "delta": handlers.onDelta(evt.text); break;
      case "done": finished = true; handlers.onDone(evt); break;
      case "error": finished = true; handlers.onError(evt.code, evt.message); break;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        handleLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    if (buffer) handleLine(buffer);
    if (!finished) handlers.onError("network", "The connection dropped before the response finished. The partial reply was kept.");
  } catch (err) {
    if ((err as Error).name === "AbortError" || signal.aborted) {
      if (!finished) handlers.onDone({ type: "done", stopped: true });
    } else if (!finished) {
      handlers.onError("network", "The connection dropped before the response finished. The partial reply was kept.");
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}
