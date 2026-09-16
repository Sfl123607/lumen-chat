"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, RefreshCw, X } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";
import { MessageItem } from "@/components/chat/MessageItem";
import { EmptyState } from "@/components/chat/EmptyState";
import { Composer } from "@/components/composer/Composer";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

export function ChatView() {
  const { messages, loadingMessages, streaming, isGeneratingHere, error, clearError, settings, regenerate, editMessage, setFeedback, activeId } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Track whether the reader is at the bottom; only auto-follow when they are.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 48;
    setPinned(atBottom);
    setShowJump(!atBottom && el.scrollHeight > el.clientHeight + 200);
  };

  // Jump to the bottom when opening a conversation; follow while streaming.
  useLayoutEffect(() => { scrollToBottom(); setPinned(true); }, [activeId, scrollToBottom]);
  const lastLen = messages[messages.length - 1]?.content.length ?? 0;
  useEffect(() => { if (pinned) scrollToBottom(); }, [messages.length, lastLen, pinned, scrollToBottom]);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;
  const canAct = !streaming;
  const showEmpty = !loadingMessages && messages.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
        {loadingMessages ? (
          <div className="flex flex-1 items-center justify-center"><Spinner /></div>
        ) : showEmpty ? (
          <EmptyState />
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-6 pt-2 sm:px-6" role="log" aria-live="polite" aria-relevant="additions text">
            {messages.map((m) => (
              <ErrorBoundary key={m.id}>
                <MessageItem
                  message={m}
                  isStreaming={streaming?.assistantId === m.id}
                  isLastAssistant={m.id === lastAssistantId}
                  showTimestamp={settings.showTimestamps}
                  renderMarkdown={settings.renderMarkdown}
                  canAct={canAct}
                  onRegenerate={() => void regenerate()}
                  onEdit={(content) => void editMessage(m.id, content)}
                  onFeedback={(f) => void setFeedback(m.id, f)}
                />
              </ErrorBoundary>
            ))}
            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger anim-fade-up">
                <p className="flex-1">{error}</p>
                <div className="flex shrink-0 items-center gap-1">
                  {lastAssistantId !== null || messages.some((m) => m.role === "user") ? (
                    <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" onClick={() => { clearError(); void regenerate(); }} disabled={!canAct}>
                      <RefreshCw size={13} /> Retry
                    </Button>
                  ) : null}
                  <button type="button" aria-label="Dismiss error" onClick={clearError} className="rounded p-1 opacity-70 hover:opacity-100"><X size={14} /></button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to latest message"
          className="absolute bottom-28 left-1/2 z-10 inline-flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border bg-surface text-muted shadow-md transition-colors hover:text-ink anim-fade-in"
        >
          <ArrowDown size={15} />
        </button>
      )}

      {isGeneratingHere && <span className="sr-only" role="status">Assistant is responding</span>}
      <Composer />
    </div>
  );
}
