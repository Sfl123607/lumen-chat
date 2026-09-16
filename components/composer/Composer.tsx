"use client";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { cn } from "@/utils/cn";

const MAX_ROWS_PX = 220;

export function Composer() {
  const { sendMessage, stopGeneration, isGeneratingHere, streaming, settings, status, prefill, focusNonce } = useChat();
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const maxChars = status?.limits.maxMessageChars ?? 12000;
  const aiReady = status?.ai.configured ?? true;
  const busyElsewhere = Boolean(streaming) && !isGeneratingHere;

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`;
    el.style.overflowY = el.scrollHeight > MAX_ROWS_PX ? "auto" : "hidden";
  }, []);

  useEffect(() => { resize(); }, [value, resize]);
  useEffect(() => { if (prefill) { setValue(prefill.text); ref.current?.focus(); } }, [prefill]);
  useEffect(() => { ref.current?.focus(); }, [focusNonce]);
  useEffect(() => { ref.current?.focus(); }, []);

  const trimmed = value.trim();
  const tooLong = value.length > maxChars;
  const canSend = trimmed.length > 0 && !tooLong && !isGeneratingHere && !busyElsewhere && aiReady;

  const submit = () => {
    if (!canSend) return;
    const text = value;
    setValue("");
    void sendMessage(text);
    requestAnimationFrame(resize);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const sendCombo = settings.enterToSend ? !e.shiftKey : e.metaKey || e.ctrlKey;
    if (sendCombo) { e.preventDefault(); submit(); }
  };

  const showCounter = value.length > maxChars * 0.8;

  return (
    <div className="px-3 pb-3 pt-1 sm:px-6 sm:pb-4">
      <div className="mx-auto w-full max-w-3xl">
        <div
          className={cn(
            "rounded-2xl border bg-surface shadow-sm transition-shadow focus-within:border-accent/50 focus-within:shadow-md",
            tooLong && "border-danger",
          )}
        >
          <label htmlFor="composer" className="sr-only">Message</label>
          <textarea
            id="composer"
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={aiReady ? "Message the assistant" : "Configure an API key to start chatting"}
            disabled={!aiReady}
            aria-describedby={showCounter ? "composer-count" : undefined}
            aria-invalid={tooLong || undefined}
            className="no-ring block max-h-[220px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 placeholder:text-faint focus:outline-none disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <ModelSelector disabled={isGeneratingHere} />
            <div className="flex items-center gap-2">
              {showCounter && (
                <span id="composer-count" className={cn("text-[11px] tabular-nums", tooLong ? "text-danger" : "text-faint")} aria-live="polite">
                  {value.length.toLocaleString()} / {maxChars.toLocaleString()}
                </span>
              )}
              {isGeneratingHere ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  aria-label="Stop generating"
                  title="Stop generating"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink text-canvas transition-opacity hover:opacity-85"
                >
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSend}
                  aria-label="Send message"
                  title={busyElsewhere ? "Another chat is still generating" : "Send"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-2 hidden text-center text-[11px] text-faint sm:block">
          {settings.enterToSend ? "Enter to send · Shift+Enter for a new line" : "Ctrl+Enter to send · Enter for a new line"} · AI can make mistakes, verify important information.
        </p>
      </div>
    </div>
  );
}
