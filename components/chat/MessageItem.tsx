"use client";
import { memo, useEffect, useRef, useState } from "react";
import { Check, Copy, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Message } from "@/types";
import { Markdown } from "@/components/markdown/Markdown";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { useCopy } from "@/hooks/useCopy";
import { formatTimestamp } from "@/utils/format";
import { cn } from "@/utils/cn";

interface Props {
  message: Message;
  isStreaming: boolean;
  isLastAssistant: boolean;
  showTimestamp: boolean;
  renderMarkdown: boolean;
  canAct: boolean;
  onRegenerate: () => void;
  onEdit: (content: string) => void;
  onFeedback: (feedback: "up" | "down" | null) => void;
}

export const MessageItem = memo(function MessageItem(props: Props) {
  return props.message.role === "user" ? <UserMessage {...props} /> : <AssistantMessage {...props} />;
});

function UserMessage({ message, showTimestamp, canAct, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { copied, copy } = useCopy();

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [editing]);

  const save = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== message.content) onEdit(t);
    else setDraft(message.content);
  };

  return (
    <article className="anim-fade-up flex flex-col items-end" aria-label="Your message">
      {editing ? (
        <div className="w-full max-w-[85%] rounded-2xl border bg-surface p-2">
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); e.target.style.height = "0px"; e.target.style.height = `${Math.min(e.target.scrollHeight, 320)}px`; }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); setDraft(message.content); setEditing(false); }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
            }}
            aria-label="Edit your message"
            className="no-ring block w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 focus:outline-none"
          />
          <div className="mt-1 flex justify-end gap-2">
            <Button size="sm" onClick={() => { setDraft(message.content); setEditing(false); }}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={save} disabled={!draft.trim()}>Save and resend</Button>
          </div>
        </div>
      ) : (
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-user-bubble px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {message.content}
        </div>
      )}
      {!editing && (
        <div className="mt-1 flex items-center gap-0.5 text-faint">
          {showTimestamp && <time dateTime={message.createdAt} className="mr-1 text-[11px]">{formatTimestamp(message.createdAt)}</time>}
          <IconButton size="sm" label={copied ? "Copied" : "Copy message"} onClick={() => copy(message.content)}>{copied ? <Check size={14} /> : <Copy size={14} />}</IconButton>
          <IconButton size="sm" label="Edit message" onClick={() => setEditing(true)} disabled={!canAct}><Pencil size={14} /></IconButton>
        </div>
      )}
    </article>
  );
}

function AssistantMessage({ message, isStreaming, isLastAssistant, showTimestamp, renderMarkdown, canAct, onRegenerate, onFeedback }: Props) {
  const { copied, copy } = useCopy();
  const empty = message.content.length === 0;

  return (
    <article className="anim-fade-up flex gap-3" aria-label="Assistant message" aria-busy={isStreaming}>
      <span aria-hidden="true" className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
        <svg viewBox="0 0 64 64" width="14" height="14" fill="currentColor"><path d="M20 44V20h6v18h14v6H20z" /><circle cx="43" cy="24" r="4" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        {empty && isStreaming ? (
          <div className="flex h-7 items-center gap-1" role="status" aria-label="Assistant is thinking">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
          </div>
        ) : renderMarkdown ? (
          <Markdown content={message.content} />
        ) : (
          <div className="prose-plain">{message.content}</div>
        )}
        {!isStreaming && !empty && (
          <div className="mt-1.5 flex items-center gap-0.5 text-faint">
            <IconButton size="sm" label={copied ? "Copied" : "Copy response"} onClick={() => copy(message.content)}>{copied ? <Check size={14} /> : <Copy size={14} />}</IconButton>
            {isLastAssistant && (
              <IconButton size="sm" label="Regenerate response" onClick={onRegenerate} disabled={!canAct}><RefreshCw size={14} /></IconButton>
            )}
            <IconButton size="sm" label="Good response" active={message.feedback === "up"} onClick={() => onFeedback(message.feedback === "up" ? null : "up")}><ThumbsUp size={14} /></IconButton>
            <IconButton size="sm" label="Bad response" active={message.feedback === "down"} onClick={() => onFeedback(message.feedback === "down" ? null : "down")}><ThumbsDown size={14} /></IconButton>
            {showTimestamp && (
              <time dateTime={message.createdAt} className={cn("ml-1 text-[11px]")}>
                {formatTimestamp(message.createdAt)}{message.model ? ` · ${message.model}` : ""}
              </time>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
