import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { DEFAULT_SETTINGS, type Conversation, type ConversationPage, type Message, type SearchResult, type UserSettings } from "@/types";
import type { ConversationStore, NewMessage } from "@/lib/store/types";
import { makeSnippet } from "@/lib/store/supabase-store";

/**
 * Demo-mode store: a JSON file on the server, one bucket per guest id.
 * Used only when Supabase is not configured. It is intentionally simple —
 * good enough to evaluate the app locally, not a multi-instance database.
 */

interface UserBucket {
  conversations: Conversation[];
  messages: Message[];
  settings: UserSettings | null;
}

interface FileShape {
  version: 1;
  users: Record<string, UserBucket>;
}

interface Snapshot {
  data: FileShape;
  loadedAt: number;
}

let snapshot: Snapshot | null = null;
let writeChain: Promise<void> = Promise.resolve();
let lastCounter = 0;

/** Monotonic ISO timestamps so ordering is stable even within the same millisecond. */
function nowIso(): string {
  const ms = Date.now();
  lastCounter = ms > lastCounter ? ms : lastCounter + 1;
  return new Date(lastCounter).toISOString();
}

function filePath(): string {
  return path.resolve(process.cwd(), env.dataDir, "demo-store.json");
}

async function load(): Promise<FileShape> {
  if (snapshot) return snapshot.data;
  const p = filePath();
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as FileShape;
    if (parsed.version !== 1 || typeof parsed.users !== "object") throw new Error("bad shape");
    snapshot = { data: parsed, loadedAt: Date.now() };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn("[local-store] starting with an empty store:", (err as Error).message);
    snapshot = { data: { version: 1, users: {} }, loadedAt: Date.now() };
  }
  return snapshot.data;
}

/** Serialized, atomic write (tmp file + rename). */
function persist(): Promise<void> {
  writeChain = writeChain.then(async () => {
    if (!snapshot) return;
    const p = filePath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot.data), "utf8");
    await fs.rename(tmp, p);
  }).catch((err) => {
    console.error("[local-store] write failed", err);
    throw new AppError("database", "Couldn't save to the local demo store. Check that the DATA_DIR is writable.");
  });
  return writeChain;
}

export class LocalStore implements ConversationStore {
  constructor(private readonly userId: string) {}

  private async bucket(): Promise<UserBucket> {
    const data = await load();
    let b = data.users[this.userId];
    if (!b) {
      b = { conversations: [], messages: [], settings: null };
      data.users[this.userId] = b;
    }
    return b;
  }

  async listConversations({ cursor, limit }: { cursor?: string | null; limit: number }): Promise<ConversationPage> {
    const b = await this.bucket();
    const sorted = [...b.conversations].sort((a, c) => (a.updatedAt < c.updatedAt ? 1 : -1));
    const filtered = cursor ? sorted.filter((c) => c.updatedAt < cursor) : sorted;
    const items = filtered.slice(0, limit);
    return { items, nextCursor: filtered.length > limit ? items[items.length - 1]!.updatedAt : null };
  }

  async countConversations(): Promise<number> {
    return (await this.bucket()).conversations.length;
  }

  async searchConversations(query: string, limit: number): Promise<SearchResult[]> {
    const b = await this.bucket();
    const q = query.toLowerCase();
    const results = new Map<string, SearchResult>();
    for (const c of b.conversations) if (c.title.toLowerCase().includes(q)) results.set(c.id, { conversation: c, snippet: null });
    for (const m of b.messages) {
      if (results.has(m.conversationId) || !m.content.toLowerCase().includes(q)) continue;
      const conv = b.conversations.find((c) => c.id === m.conversationId);
      if (conv) results.set(conv.id, { conversation: conv, snippet: makeSnippet(m.content, query) });
    }
    return [...results.values()].sort((a, c) => (a.conversation.updatedAt < c.conversation.updatedAt ? 1 : -1)).slice(0, limit);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return (await this.bucket()).conversations.find((c) => c.id === id) ?? null;
  }

  async createConversation(title: string): Promise<Conversation> {
    const b = await this.bucket();
    const ts = nowIso();
    const conv: Conversation = { id: randomUUID(), title, titleIsCustom: false, summary: null, summaryThrough: null, createdAt: ts, updatedAt: ts };
    b.conversations.push(conv);
    await persist();
    return conv;
  }

  async updateConversation(id: string, patch: Partial<Pick<Conversation, "title" | "titleIsCustom" | "summary" | "summaryThrough">> & { touch?: boolean }) {
    const b = await this.bucket();
    const conv = b.conversations.find((c) => c.id === id);
    if (!conv) return null;
    if (patch.title !== undefined) conv.title = patch.title;
    if (patch.titleIsCustom !== undefined) conv.titleIsCustom = patch.titleIsCustom;
    if (patch.summary !== undefined) conv.summary = patch.summary;
    if (patch.summaryThrough !== undefined) conv.summaryThrough = patch.summaryThrough;
    if (patch.touch) conv.updatedAt = nowIso();
    await persist();
    return conv;
  }

  async deleteConversation(id: string): Promise<boolean> {
    const b = await this.bucket();
    const before = b.conversations.length;
    b.conversations = b.conversations.filter((c) => c.id !== id);
    b.messages = b.messages.filter((m) => m.conversationId !== id);
    if (b.conversations.length === before) return false;
    await persist();
    return true;
  }

  async deleteAllConversations(): Promise<number> {
    const b = await this.bucket();
    const n = b.conversations.length;
    b.conversations = [];
    b.messages = [];
    await persist();
    return n;
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    const b = await this.bucket();
    return b.messages.filter((m) => m.conversationId === conversationId).sort((a, c) => (a.createdAt < c.createdAt ? -1 : 1));
  }

  async getMessage(id: string): Promise<Message | null> {
    return (await this.bucket()).messages.find((m) => m.id === id) ?? null;
  }

  async addMessage(input: NewMessage): Promise<Message> {
    const b = await this.bucket();
    if (!b.conversations.some((c) => c.id === input.conversationId)) throw new AppError("not_found", "Conversation not found.");
    const msg: Message = {
      id: randomUUID(),
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      model: input.model ?? null,
      feedback: null,
      createdAt: nowIso(),
    };
    b.messages.push(msg);
    await persist();
    return msg;
  }

  async updateMessage(id: string, patch: Partial<Pick<Message, "content" | "model" | "feedback">>): Promise<Message | null> {
    const b = await this.bucket();
    const msg = b.messages.find((m) => m.id === id);
    if (!msg) return null;
    if (patch.content !== undefined) msg.content = patch.content;
    if (patch.model !== undefined) msg.model = patch.model;
    if (patch.feedback !== undefined) msg.feedback = patch.feedback;
    await persist();
    return msg;
  }

  async deleteMessage(id: string): Promise<boolean> {
    const b = await this.bucket();
    const before = b.messages.length;
    b.messages = b.messages.filter((m) => m.id !== id);
    if (b.messages.length === before) return false;
    await persist();
    return true;
  }

  async deleteMessagesAfter(conversationId: string, afterCreatedAt: string): Promise<number> {
    const b = await this.bucket();
    const before = b.messages.length;
    b.messages = b.messages.filter((m) => !(m.conversationId === conversationId && m.createdAt > afterCreatedAt));
    const removed = before - b.messages.length;
    if (removed) await persist();
    return removed;
  }

  async getSettings(): Promise<UserSettings> {
    const b = await this.bucket();
    return b.settings ? { ...DEFAULT_SETTINGS, ...b.settings } : { ...DEFAULT_SETTINGS };
  }

  async saveSettings(settings: UserSettings): Promise<UserSettings> {
    const b = await this.bucket();
    b.settings = settings;
    await persist();
    return settings;
  }
}
