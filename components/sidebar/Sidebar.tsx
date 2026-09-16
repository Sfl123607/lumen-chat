"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, PanelLeftClose, Search, Settings, SquarePen, User, X } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";
import { ConversationItem } from "@/components/sidebar/ConversationItem";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";
import { recencyBucket } from "@/utils/format";
import type { Conversation, SearchResult } from "@/types";

interface Props { onOpenSettings: () => void; onClose: () => void }

export function Sidebar({ onOpenSettings, onClose }: Props) {
  const {
    conversations, hasMore, loadingConversations, loadMoreConversations, activeId, status,
    newChat, openConversation, renameConversation, deleteConversation, exportConversation, search,
  } = useChat();
  const router = useRouter();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 200);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);

  useEffect(() => {
    if (!debounced) { setResults(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    search(debounced)
      .then((r) => { if (!cancelled) setResults(r); })
      .catch((err: unknown) => { if (!cancelled) toast(err instanceof Error ? err.message : "Search failed.", "error"); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debounced, search, toast]);

  const groups = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const c of conversations) {
      const b = recencyBucket(c.updatedAt);
      map.set(b, [...(map.get(b) ?? []), c]);
    }
    return [...map.entries()];
  }, [conversations]);

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isSearch = Boolean(debounced);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 p-2.5 pb-1">
        <Button variant="ghost" onClick={newChat} className="flex-1 justify-start gap-2.5 px-2.5 font-medium">
          <SquarePen size={17} className="text-muted" /> New chat
        </Button>
        <IconButton label="Close sidebar" onClick={onClose}><PanelLeftClose size={18} /></IconButton>
      </div>

      <div className="px-2.5 pb-2">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search conversations"
            className="h-9 w-full rounded-lg border bg-canvas pl-8 pr-8 text-sm placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink">
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2.5 pb-2" aria-label="Conversation list" aria-busy={loadingConversations || searching}>
        {isSearch ? (
          <SearchResults results={results} searching={searching} activeId={activeId} onOpen={openConversation} onRename={renameConversation} onDelete={setPendingDelete} onExport={exportConversation} />
        ) : loadingConversations && conversations.length === 0 ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] text-muted">No conversations yet. Your chats will appear here.</p>
        ) : (
          <>
            {groups.map(([bucket, items]) => (
              <section key={bucket} className="mb-3">
                <h2 className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-faint">{bucket}</h2>
                <ul className="space-y-0.5">
                  {items.map((c) => (
                    <li key={c.id}>
                      <ConversationItem
                        conversation={c}
                        active={c.id === activeId}
                        onOpen={() => openConversation(c.id)}
                        onRename={(t) => renameConversation(c.id, t)}
                        onDelete={() => setPendingDelete(c)}
                        onExport={(f) => exportConversation(c.id, f)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {hasMore && (
              <Button variant="ghost" size="sm" className="mb-2 w-full text-muted" onClick={loadMoreConversations} disabled={loadingConversations}>
                {loadingConversations ? <Spinner className="h-3.5 w-3.5" /> : "Load older chats"}
              </Button>
            )}
          </>
        )}
      </nav>

      <div className="border-t p-2.5">
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><User size={15} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{status?.auth.mode === "supabase" ? status.auth.email ?? "Signed in" : "Guest"}</p>
            <p className="truncate text-[11px] text-muted">{status?.auth.mode === "supabase" ? "Signed in" : status ? "Demo mode · local, no sign-in" : ""}</p>
          </div>
          <IconButton label="Settings" onClick={onOpenSettings}><Settings size={17} /></IconButton>
          {status?.auth.mode === "supabase" && <IconButton label="Sign out" onClick={signOut}><LogOut size={17} /></IconButton>}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this conversation?"
        description={pendingDelete ? `"${pendingDelete.title}" and all of its messages will be removed. This can't be undone.` : ""}
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (pendingDelete) void deleteConversation(pendingDelete.id); setPendingDelete(null); }}
      />
    </div>
  );
}

interface SearchProps {
  results: SearchResult[] | null;
  searching: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (c: Conversation) => void;
  onExport: (id: string, format: "txt" | "md" | "json") => Promise<void>;
}

function SearchResults({ results, searching, activeId, onOpen, onRename, onDelete, onExport }: SearchProps) {
  if (searching && !results) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (!results || results.length === 0) return <p className="px-2 py-8 text-center text-[13px] text-muted">No matching conversations.</p>;
  return (
    <ul className="space-y-0.5 pt-1" aria-live="polite">
      {results.map(({ conversation: c, snippet }) => (
        <li key={c.id}>
          <ConversationItem
            conversation={c}
            active={c.id === activeId}
            snippet={snippet}
            onOpen={() => onOpen(c.id)}
            onRename={(t) => onRename(c.id, t)}
            onDelete={() => onDelete(c)}
            onExport={(f) => onExport(c.id, f)}
          />
        </li>
      ))}
    </ul>
  );
}
