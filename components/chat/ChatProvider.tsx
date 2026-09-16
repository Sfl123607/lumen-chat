"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/client/api";
import { streamChat } from "@/lib/client/chat-stream";
import { useToast } from "@/components/ui/Toast";
import { buildExport, downloadText, safeFilename, type ExportFormat } from "@/utils/export";
import {
  DEFAULT_SETTINGS,
  type AppStatus,
  type ChatRequestBody,
  type Conversation,
  type ConversationPage,
  type Feedback,
  type Message,
  type ModelTier,
  type SearchResult,
  type UserSettings,
} from "@/types";

const NEW_KEY = "new";

export interface StreamingState {
  key: string;
  assistantId: string;
}

export interface ChatContextValue {
  status: AppStatus | null;
  settings: UserSettings;
  settingsLoaded: boolean;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;

  conversations: Conversation[];
  hasMore: boolean;
  loadingConversations: boolean;
  loadMoreConversations: () => Promise<void>;

  activeId: string | null;
  activeConversation: Conversation | null;
  messages: Message[];
  loadingMessages: boolean;
  streaming: StreamingState | null;
  /** True when the current view is the one generating. */
  isGeneratingHere: boolean;
  error: string | null;
  clearError: () => void;

  sendMessage: (content: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  regenerate: () => Promise<void>;
  stopGeneration: () => void;
  newChat: () => void;
  openConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  clearAllConversations: () => Promise<void>;
  setFeedback: (messageId: string, feedback: Feedback | null) => Promise<void>;
  search: (query: string) => Promise<SearchResult[]>;
  exportConversation: (id: string, format: ExportFormat) => Promise<void>;

  modelTier: ModelTier;
  setModelTier: (tier: ModelTier) => void;

  /** Puts text into the composer (example prompts). */
  prefill: { text: string; nonce: number } | null;
  requestPrefill: (text: string) => void;
  /** Bumps to ask the composer to focus itself. */
  focusNonce: number;
  requestFocus: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function tempId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function conversationIdFromPath(pathname: string): string | null {
  const m = /^\/c\/([0-9a-f-]{36})\/?$/i.exec(pathname);
  return m ? m[1]!.toLowerCase() : null;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const activeId = conversationIdFromPath(pathname);
  const activeKey = activeId ?? NEW_KEY;

  const [status, setStatus] = useState<AppStatus | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [messagesByKey, setMessagesByKey] = useState<Record<string, Message[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelTierOverride, setModelTierOverride] = useState<ModelTier | null>(null);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const streamKeyRef = useRef<string | null>(null);
  const loadedKeys = useRef<Set<string>>(new Set());

  // ── Bootstrap: status, settings, first page of conversations ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, st, page] = await Promise.allSettled([
        api<AppStatus>("/api/status"),
        api<UserSettings>("/api/settings"),
        api<ConversationPage>("/api/conversations?limit=30"),
      ]);
      if (cancelled) return;
      if (s.status === "fulfilled") setStatus(s.value);
      if (st.status === "fulfilled") setSettings({ ...DEFAULT_SETTINGS, ...st.value });
      else toast("Couldn't load your settings; using defaults.", "error");
      setSettingsLoaded(true);
      if (page.status === "fulfilled") {
        setConversations(page.value.items);
        setNextCursor(page.value.nextCursor);
      } else {
        toast(page.reason instanceof Error ? page.reason.message : "Couldn't load conversations.", "error");
      }
      setLoadingConversations(false);
    })();
    return () => { cancelled = true; };
  }, [toast]);

  // ── Load messages for the active conversation (stale-while-revalidate) ──
  useEffect(() => {
    if (!activeId) return;
    if (streamKeyRef.current === activeId) return; // already live here
    let cancelled = false;
    const alreadyLoaded = loadedKeys.current.has(activeId);
    if (!alreadyLoaded) setLoadingKey(activeId);
    (async () => {
      try {
        const data = await api<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${activeId}`);
        if (cancelled || streamKeyRef.current === activeId) return;
        setMessagesByKey((m) => ({ ...m, [activeId]: data.messages }));
        setConversations((list) => (list.some((c) => c.id === activeId) ? list.map((c) => (c.id === activeId ? data.conversation : c)) : [data.conversation, ...list]));
        loadedKeys.current.add(activeId);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 404) {
          toast("That conversation doesn't exist.", "error");
          router.replace("/");
        } else {
          toast(err instanceof Error ? err.message : "Couldn't load the conversation.", "error");
        }
      } finally {
        if (!cancelled) setLoadingKey((k) => (k === activeId ? null : k));
      }
    })();
    return () => { cancelled = true; };
  }, [activeId, router, toast]);

  // ── Settings ──
  const updateSettings = useCallback(async (patch: Partial<UserSettings>) => {
    let previous: UserSettings = DEFAULT_SETTINGS;
    let next: UserSettings = DEFAULT_SETTINGS;
    setSettings((s) => { previous = s; next = { ...s, ...patch }; return next; });
    try {
      const saved = await api<UserSettings>("/api/settings", { method: "PUT", body: JSON.stringify(next) });
      setSettings(saved);
    } catch (err) {
      setSettings(previous);
      toast(err instanceof Error ? err.message : "Couldn't save settings.", "error");
      throw err;
    }
  }, [toast]);

  // ── Conversations list ──
  const loadMoreConversations = useCallback(async () => {
    if (!nextCursor || loadingConversations) return;
    setLoadingConversations(true);
    try {
      const page = await api<ConversationPage>(`/api/conversations?limit=30&cursor=${encodeURIComponent(nextCursor)}`);
      setConversations((list) => {
        const seen = new Set(list.map((c) => c.id));
        return [...list, ...page.items.filter((c) => !seen.has(c.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't load more conversations.", "error");
    } finally {
      setLoadingConversations(false);
    }
  }, [nextCursor, loadingConversations, toast]);

  const bumpConversation = useCallback((id: string, patch: Partial<Conversation> = {}) => {
    setConversations((list) => {
      const existing = list.find((c) => c.id === id);
      if (!existing) return list;
      const updated = { ...existing, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
      return [updated, ...list.filter((c) => c.id !== id)];
    });
  }, []);

  // ── Generation core ──
  const updateMessages = useCallback((key: string, fn: (msgs: Message[]) => Message[]) => {
    setMessagesByKey((m) => ({ ...m, [key]: fn(m[key] ?? []) }));
  }, []);

  const runGeneration = useCallback(
    async (key: string, body: ChatRequestBody, optimisticUser: Message | null, optimisticAssistant: Message) => {
      if (abortRef.current) return; // one generation at a time
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      streamKeyRef.current = key;
      let currentKey = key;
      let assistantId = optimisticAssistant.id;
      let userTempId = optimisticUser?.id ?? null;
      setStreaming({ key, assistantId });

      let pending = "";
      let content = "";
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushTimer = null;
        if (!pending) return;
        content += pending;
        pending = "";
        const snapshot = content;
        const id = assistantId;
        updateMessages(currentKey, (msgs) => msgs.map((m) => (m.id === id ? { ...m, content: snapshot } : m)));
      };
      const scheduleFlush = () => { if (!flushTimer) flushTimer = setTimeout(flush, 40); };

      const finish = () => {
        if (flushTimer) clearTimeout(flushTimer);
        flush();
        abortRef.current = null;
        streamKeyRef.current = null;
        setStreaming(null);
      };

      await streamChat(body, controller.signal, {
        onMeta: (meta) => {
          const realKey = meta.conversationId;
          const fromKey = currentKey;
          // Capture the temporary ids now: the updater below runs later, after they've been reassigned.
          const tempAssistantId = assistantId;
          const tempUserId = userTempId;
          setMessagesByKey((m) => {
            const msgs = (m[fromKey] ?? []).map((msg) => {
              if (msg.id === tempAssistantId) return { ...msg, id: meta.assistantMessageId, conversationId: realKey, model: meta.model, createdAt: meta.createdAt };
              if (tempUserId && msg.id === tempUserId && meta.userMessageId) return { ...msg, id: meta.userMessageId, conversationId: realKey };
              return msg;
            });
            const next = { ...m, [realKey]: msgs };
            if (fromKey !== realKey) next[fromKey] = [];
            return next;
          });
          assistantId = meta.assistantMessageId;
          userTempId = null;
          if (fromKey !== realKey) {
            // Brand-new conversation: add it to the sidebar and move the URL without a page reload.
            const now = new Date().toISOString();
            const firstUser = optimisticUser?.content ?? "";
            const title = firstUser.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
            setConversations((list) => [
              { id: realKey, title, titleIsCustom: false, summary: null, summaryThrough: null, createdAt: now, updatedAt: now },
              ...list.filter((c) => c.id !== realKey),
            ]);
            loadedKeys.current.add(realKey);
            window.history.pushState(null, "", `/c/${realKey}`);
          }
          currentKey = realKey;
          streamKeyRef.current = realKey;
          setStreaming({ key: realKey, assistantId });
        },
        onDelta: (text) => { pending += text; scheduleFlush(); },
        onDone: (evt) => {
          finish();
          const id = assistantId;
          const key2 = currentKey;
          // Drop the assistant row if nothing was produced before Stop.
          setMessagesByKey((m) => {
            const msgs = m[key2] ?? [];
            const target = msgs.find((x) => x.id === id);
            if (target && !target.content.trim()) return { ...m, [key2]: msgs.filter((x) => x.id !== id) };
            return m;
          });
          bumpConversation(key2, evt.title ? { title: evt.title } : {});
          if (evt.stopped && !content.trim()) toast("Generation stopped before any text arrived.");
        },
        onError: (_code, message) => {
          finish();
          const id = assistantId;
          const key2 = currentKey;
          setMessagesByKey((m) => {
            const msgs = m[key2] ?? [];
            const target = msgs.find((x) => x.id === id);
            if (target && !target.content.trim()) return { ...m, [key2]: msgs.filter((x) => x.id !== id) };
            return m;
          });
          setError(message);
        },
      });
    },
    [bumpConversation, toast, updateMessages],
  );

  const modelTier = modelTierOverride ?? settings.modelTier;

  const sendMessage = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text || abortRef.current) return;
    const key = activeKey;
    const now = new Date().toISOString();
    const user: Message = { id: tempId("u"), conversationId: activeId ?? "", role: "user", content: text, model: null, feedback: null, createdAt: now };
    const assistant: Message = { id: tempId("a"), conversationId: activeId ?? "", role: "assistant", content: "", model: null, feedback: null, createdAt: now };
    updateMessages(key, (msgs) => [...msgs, user, assistant]);
    await runGeneration(key, { action: "send", conversationId: activeId ?? undefined, content: text, modelTier }, user, assistant);
  }, [activeKey, activeId, modelTier, runGeneration, updateMessages]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    const text = content.trim();
    if (!text || !activeId || abortRef.current) return;
    const msgs = messagesByKey[activeId] ?? [];
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const edited = { ...msgs[idx]!, content: text };
    const assistant: Message = { id: tempId("a"), conversationId: activeId, role: "assistant", content: "", model: null, feedback: null, createdAt: new Date().toISOString() };
    updateMessages(activeId, () => [...msgs.slice(0, idx), edited, assistant]);
    await runGeneration(activeId, { action: "edit", conversationId: activeId, messageId, content: text, modelTier }, null, assistant);
  }, [activeId, messagesByKey, modelTier, runGeneration, updateMessages]);

  const regenerate = useCallback(async () => {
    if (!activeId || abortRef.current) return;
    const msgs = messagesByKey[activeId] ?? [];
    let lastUser = -1;
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i]!.role === "user") { lastUser = i; break; }
    if (lastUser === -1) return;
    const assistant: Message = { id: tempId("a"), conversationId: activeId, role: "assistant", content: "", model: null, feedback: null, createdAt: new Date().toISOString() };
    updateMessages(activeId, () => [...msgs.slice(0, lastUser + 1), assistant]);
    await runGeneration(activeId, { action: "regenerate", conversationId: activeId, modelTier }, null, assistant);
  }, [activeId, messagesByKey, modelTier, runGeneration, updateMessages]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const requestFocus = useCallback(() => setFocusNonce((n) => n + 1), []);

  const newChat = useCallback(() => {
    setError(null);
    setMessagesByKey((m) => ({ ...m, [NEW_KEY]: [] }));
    if (pathname !== "/") router.push("/");
    requestFocus();
  }, [pathname, router, requestFocus]);

  const openConversation = useCallback((id: string) => {
    setError(null);
    router.push(`/c/${id}`);
  }, [router]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    const clean = title.trim().slice(0, 120);
    if (!clean) return;
    const prev = conversations.find((c) => c.id === id);
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, title: clean, titleIsCustom: true } : c)));
    try {
      const saved = await api<Conversation>(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title: clean }) });
      setConversations((list) => list.map((c) => (c.id === id ? saved : c)));
    } catch (err) {
      if (prev) setConversations((list) => list.map((c) => (c.id === id ? prev : c)));
      toast(err instanceof Error ? err.message : "Couldn't rename the conversation.", "error");
    }
  }, [conversations, toast]);

  const deleteConversation = useCallback(async (id: string) => {
    if (streamKeyRef.current === id) abortRef.current?.abort();
    const prevList = conversations;
    setConversations((list) => list.filter((c) => c.id !== id));
    setMessagesByKey((m) => { const next = { ...m }; delete next[id]; return next; });
    loadedKeys.current.delete(id);
    if (activeId === id) router.push("/");
    try {
      await api(`/api/conversations/${id}`, { method: "DELETE" });
      toast("Conversation deleted");
    } catch (err) {
      if (!(err instanceof ApiClientError && err.status === 404)) {
        setConversations(prevList);
        toast(err instanceof Error ? err.message : "Couldn't delete the conversation.", "error");
      }
    }
  }, [activeId, conversations, router, toast]);

  const clearAllConversations = useCallback(async () => {
    abortRef.current?.abort();
    try {
      await api("/api/conversations", { method: "DELETE" });
      setConversations([]);
      setNextCursor(null);
      setMessagesByKey({});
      loadedKeys.current.clear();
      if (activeId) router.push("/");
      toast("Conversation history cleared");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't clear the history.", "error");
      throw err;
    }
  }, [activeId, router, toast]);

  const setFeedback = useCallback(async (messageId: string, feedback: Feedback | null) => {
    const key = activeKey;
    updateMessages(key, (msgs) => msgs.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
    try {
      await api(`/api/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ feedback }) });
    } catch (err) {
      updateMessages(key, (msgs) => msgs.map((m) => (m.id === messageId ? { ...m, feedback: feedback === null ? m.feedback : null } : m)));
      toast(err instanceof Error ? err.message : "Couldn't save feedback.", "error");
    }
  }, [activeKey, toast, updateMessages]);

  const search = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return [];
    const data = await api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`);
    return data.results;
  }, []);

  const exportConversation = useCallback(async (id: string, format: ExportFormat) => {
    try {
      const data = await api<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${id}`);
      const { content, mime, ext } = buildExport(data.conversation, data.messages, format);
      downloadText(`${safeFilename(data.conversation.title)}.${ext}`, content, mime);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't export the conversation.", "error");
    }
  }, [toast]);

  const requestPrefill = useCallback((text: string) => setPrefill({ text, nonce: Date.now() }), []);

  const messages = messagesByKey[activeKey] ?? [];
  const activeConversation = useMemo(() => (activeId ? conversations.find((c) => c.id === activeId) ?? null : null), [activeId, conversations]);

  const value = useMemo<ChatContextValue>(() => ({
    status,
    settings,
    settingsLoaded,
    updateSettings,
    conversations,
    hasMore: Boolean(nextCursor),
    loadingConversations,
    loadMoreConversations,
    activeId,
    activeConversation,
    messages,
    loadingMessages: loadingKey === activeKey && !messagesByKey[activeKey],
    streaming,
    isGeneratingHere: streaming?.key === activeKey,
    error,
    clearError: () => setError(null),
    sendMessage,
    editMessage,
    regenerate,
    stopGeneration,
    newChat,
    openConversation,
    renameConversation,
    deleteConversation,
    clearAllConversations,
    setFeedback,
    search,
    exportConversation,
    modelTier,
    setModelTier: setModelTierOverride,
    prefill,
    requestPrefill,
    focusNonce,
    requestFocus,
  }), [
    status, settings, settingsLoaded, updateSettings, conversations, nextCursor, loadingConversations, loadMoreConversations,
    activeId, activeConversation, messages, loadingKey, activeKey, messagesByKey, streaming, error, sendMessage, editMessage,
    regenerate, stopGeneration, newChat, openConversation, renameConversation, deleteConversation, clearAllConversations,
    setFeedback, search, exportConversation, modelTier, prefill, requestPrefill, focusNonce, requestFocus,
  ]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
