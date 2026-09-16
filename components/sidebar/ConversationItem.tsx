"use client";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2, FileText, FileJson, FileCode } from "lucide-react";
import type { Conversation } from "@/types";
import { Menu } from "@/components/ui/Menu";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/utils/cn";
import type { ExportFormat } from "@/utils/export";

interface Props {
  conversation: Conversation;
  active: boolean;
  snippet?: string | null;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onExport: (format: ExportFormat) => void;
}

export function ConversationItem({ conversation, active, snippet, onOpen, onRename, onDelete, onExport }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  useEffect(() => { if (!editing) setDraft(conversation.title); }, [conversation.title, editing]);

  const commit = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== conversation.title) onRename(t);
    else setDraft(conversation.title);
  };

  if (editing) {
    return (
      <div className="px-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); setDraft(conversation.title); setEditing(false); }
          }}
          maxLength={120}
          aria-label="Conversation title"
          className="h-8 w-full rounded-lg border bg-surface px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-center rounded-lg pr-1 transition-colors",
        active ? "bg-raised" : "hover:bg-raised/70",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "page" : undefined}
        className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="block truncate">{conversation.title}</span>
        {snippet && <span className="mt-0.5 block truncate text-xs text-muted">{snippet}</span>}
      </button>
      <div className={cn("shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100", active && "opacity-100")}>
        <Menu
          items={[
            { label: "Rename", icon: <Pencil size={14} />, onSelect: () => setEditing(true) },
            { label: "Export as Markdown", icon: <FileCode size={14} />, onSelect: () => onExport("md") },
            { label: "Export as text", icon: <FileText size={14} />, onSelect: () => onExport("txt") },
            { label: "Export as JSON", icon: <FileJson size={14} />, onSelect: () => onExport("json") },
            { label: "Delete", icon: <Trash2 size={14} />, onSelect: onDelete, danger: true },
          ]}
          trigger={(props) => (
            <IconButton size="sm" label={`Options for ${conversation.title}`} {...props}>
              <MoreHorizontal size={16} />
            </IconButton>
          )}
        />
      </div>
    </div>
  );
}
