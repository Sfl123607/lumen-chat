import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { DEFAULT_SETTINGS, type Conversation, type ConversationPage, type Message, type SearchResult, type UserSettings } from "@/types";
import type { ConversationStore, NewMessage } from "@/lib/store/types";

interface ConversationRow {
  id: string;
  title: string;
  title_is_custom: boolean;
  summary: string | null;
  summary_through: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: Message["role"];
  content: string;
  model: string | null;
  feedback: Message["feedback"];
  created_at: string;
}

interface SettingsRow {
  theme: UserSettings["theme"];
  enter_to_send: boolean;
  show_timestamps: boolean;
  render_markdown: boolean;
  model_tier: UserSettings["modelTier"];
  temperature: number;
  max_tokens: number;
  system_prompt: string | null;
}

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  title: r.title,
  titleIsCustom: r.title_is_custom,
  summary: r.summary,
  summaryThrough: r.summary_through,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  role: r.role,
  content: r.content,
  model: r.model,
  feedback: r.feedback,
  createdAt: r.created_at,
});

function dbError(err: { message: string } | null | undefined, action: string): never {
  console.error(`[db] ${action}:`, err?.message);
  throw new AppError("database", "The database request failed. Please try again.");
}

/**
 * Postgres-backed store using the caller's Supabase session, so row-level
 * security enforces ownership in addition to the explicit user_id filters.
 */
export class SupabaseStore implements ConversationStore {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async listConversations({ cursor, limit }: { cursor?: string | null; limit: number }): Promise<ConversationPage> {
    let q = this.db
      .from("conversations")
      .select("id,title,title_is_custom,summary,summary_through,created_at,updated_at")
      .eq("user_id", this.userId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (cursor) q = q.lt("updated_at", cursor);
    const { data, error } = await q;
    if (error) dbError(error, "listConversations");
    const rows = (data ?? []) as ConversationRow[];
    const items = rows.slice(0, limit).map(toConversation);
    const nextCursor = rows.length > limit ? items[items.length - 1]!.updatedAt : null;
    return { items, nextCursor };
  }

  async countConversations(): Promise<number> {
    const { count, error } = await this.db.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", this.userId);
    if (error) dbError(error, "countConversations");
    return count ?? 0;
  }

  async searchConversations(query: string, limit: number): Promise<SearchResult[]> {
    const pattern = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const [byTitle, byMessage] = await Promise.all([
      this.db
        .from("conversations")
        .select("id,title,title_is_custom,summary,summary_through,created_at,updated_at")
        .eq("user_id", this.userId)
        .ilike("title", pattern)
        .order("updated_at", { ascending: false })
        .limit(limit),
      this.db
        .from("messages")
        .select("content,conversation_id,created_at,conversations!inner(id,title,title_is_custom,summary,summary_through,created_at,updated_at)")
        .eq("user_id", this.userId)
        .ilike("content", pattern)
        .order("created_at", { ascending: false })
        .limit(limit * 3),
    ]);
    if (byTitle.error) dbError(byTitle.error, "searchConversations.title");
    if (byMessage.error) dbError(byMessage.error, "searchConversations.messages");

    const results = new Map<string, SearchResult>();
    for (const r of (byTitle.data ?? []) as ConversationRow[]) results.set(r.id, { conversation: toConversation(r), snippet: null });
    type Hit = { content: string; conversation_id: string; conversations: ConversationRow | ConversationRow[] };
    for (const hit of (byMessage.data ?? []) as unknown as Hit[]) {
      if (results.has(hit.conversation_id)) continue;
      const conv = Array.isArray(hit.conversations) ? hit.conversations[0] : hit.conversations;
      if (!conv) continue;
      results.set(hit.conversation_id, { conversation: toConversation(conv), snippet: makeSnippet(hit.content, query) });
      if (results.size >= limit) break;
    }
    return [...results.values()].sort((a, b) => (a.conversation.updatedAt < b.conversation.updatedAt ? 1 : -1)).slice(0, limit);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const { data, error } = await this.db
      .from("conversations")
      .select("id,title,title_is_custom,summary,summary_through,created_at,updated_at")
      .eq("user_id", this.userId)
      .eq("id", id)
      .maybeSingle();
    if (error) dbError(error, "getConversation");
    return data ? toConversation(data as ConversationRow) : null;
  }

  async createConversation(title: string): Promise<Conversation> {
    const { data, error } = await this.db
      .from("conversations")
      .insert({ user_id: this.userId, title })
      .select("id,title,title_is_custom,summary,summary_through,created_at,updated_at")
      .single();
    if (error || !data) dbError(error, "createConversation");
    return toConversation(data as ConversationRow);
  }

  async updateConversation(id: string, patch: Partial<Pick<Conversation, "title" | "titleIsCustom" | "summary" | "summaryThrough">> & { touch?: boolean }) {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.titleIsCustom !== undefined) row.title_is_custom = patch.titleIsCustom;
    if (patch.summary !== undefined) row.summary = patch.summary;
    if (patch.summaryThrough !== undefined) row.summary_through = patch.summaryThrough;
    if (patch.touch) row.updated_at = new Date().toISOString();
    if (Object.keys(row).length === 0) return this.getConversation(id);
    const { data, error } = await this.db
      .from("conversations")
      .update(row)
      .eq("user_id", this.userId)
      .eq("id", id)
      .select("id,title,title_is_custom,summary,summary_through,created_at,updated_at")
      .maybeSingle();
    if (error) dbError(error, "updateConversation");
    return data ? toConversation(data as ConversationRow) : null;
  }

  async deleteConversation(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("conversations").delete().eq("user_id", this.userId).eq("id", id).select("id");
    if (error) dbError(error, "deleteConversation");
    return (data?.length ?? 0) > 0;
  }

  async deleteAllConversations(): Promise<number> {
    const { data, error } = await this.db.from("conversations").delete().eq("user_id", this.userId).select("id");
    if (error) dbError(error, "deleteAllConversations");
    return data?.length ?? 0;
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await this.db
      .from("messages")
      .select("id,conversation_id,role,content,model,feedback,created_at")
      .eq("user_id", this.userId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (error) dbError(error, "listMessages");
    return ((data ?? []) as MessageRow[]).map(toMessage);
  }

  async getMessage(id: string): Promise<Message | null> {
    const { data, error } = await this.db
      .from("messages")
      .select("id,conversation_id,role,content,model,feedback,created_at")
      .eq("user_id", this.userId)
      .eq("id", id)
      .maybeSingle();
    if (error) dbError(error, "getMessage");
    return data ? toMessage(data as MessageRow) : null;
  }

  async addMessage(input: NewMessage): Promise<Message> {
    const { data, error } = await this.db
      .from("messages")
      .insert({ user_id: this.userId, conversation_id: input.conversationId, role: input.role, content: input.content, model: input.model ?? null })
      .select("id,conversation_id,role,content,model,feedback,created_at")
      .single();
    if (error || !data) dbError(error, "addMessage");
    return toMessage(data as MessageRow);
  }

  async updateMessage(id: string, patch: Partial<Pick<Message, "content" | "model" | "feedback">>): Promise<Message | null> {
    const { data, error } = await this.db
      .from("messages")
      .update(patch)
      .eq("user_id", this.userId)
      .eq("id", id)
      .select("id,conversation_id,role,content,model,feedback,created_at")
      .maybeSingle();
    if (error) dbError(error, "updateMessage");
    return data ? toMessage(data as MessageRow) : null;
  }

  async deleteMessage(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("messages").delete().eq("user_id", this.userId).eq("id", id).select("id");
    if (error) dbError(error, "deleteMessage");
    return (data?.length ?? 0) > 0;
  }

  async deleteMessagesAfter(conversationId: string, afterCreatedAt: string): Promise<number> {
    const { data, error } = await this.db
      .from("messages")
      .delete()
      .eq("user_id", this.userId)
      .eq("conversation_id", conversationId)
      .gt("created_at", afterCreatedAt)
      .select("id");
    if (error) dbError(error, "deleteMessagesAfter");
    return data?.length ?? 0;
  }

  async getSettings(): Promise<UserSettings> {
    const { data, error } = await this.db
      .from("settings")
      .select("theme,enter_to_send,show_timestamps,render_markdown,model_tier,temperature,max_tokens,system_prompt")
      .eq("user_id", this.userId)
      .maybeSingle();
    if (error) dbError(error, "getSettings");
    if (!data) return { ...DEFAULT_SETTINGS };
    const r = data as SettingsRow;
    return {
      theme: r.theme,
      enterToSend: r.enter_to_send,
      showTimestamps: r.show_timestamps,
      renderMarkdown: r.render_markdown,
      modelTier: r.model_tier,
      temperature: Number(r.temperature),
      maxTokens: r.max_tokens,
      systemPrompt: r.system_prompt,
    };
  }

  async saveSettings(s: UserSettings): Promise<UserSettings> {
    const { error } = await this.db.from("settings").upsert(
      {
        user_id: this.userId,
        theme: s.theme,
        enter_to_send: s.enterToSend,
        show_timestamps: s.showTimestamps,
        render_markdown: s.renderMarkdown,
        model_tier: s.modelTier,
        temperature: s.temperature,
        max_tokens: s.maxTokens,
        system_prompt: s.systemPrompt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) dbError(error, "saveSettings");
    return s;
  }
}

export function makeSnippet(content: string, query: string): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, (idx === -1 ? 0 : idx) + query.length + 60);
  const text = content.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${text}${end < content.length ? "…" : ""}`;
}
