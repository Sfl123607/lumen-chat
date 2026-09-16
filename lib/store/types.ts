import type { Conversation, ConversationPage, Feedback, Message, Role, SearchResult, UserSettings } from "@/types";

export interface NewMessage {
  conversationId: string;
  role: Role;
  content: string;
  model?: string | null;
}

/** Reasonable per-user limits so storage can't grow without bound. */
export const LIMITS = {
  maxConversationsPerUser: 500,
  maxMessagesPerConversation: 2000,
} as const;

/**
 * All methods are scoped to a single user (the store is created per request
 * for the authenticated user), so a user can never read another user's data.
 */
export interface ConversationStore {
  listConversations(opts: { cursor?: string | null; limit: number }): Promise<ConversationPage>;
  countConversations(): Promise<number>;
  searchConversations(query: string, limit: number): Promise<SearchResult[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(title: string): Promise<Conversation>;
  updateConversation(id: string, patch: Partial<Pick<Conversation, "title" | "titleIsCustom" | "summary" | "summaryThrough">> & { touch?: boolean }): Promise<Conversation | null>;
  deleteConversation(id: string): Promise<boolean>;
  deleteAllConversations(): Promise<number>;

  listMessages(conversationId: string): Promise<Message[]>;
  getMessage(id: string): Promise<Message | null>;
  addMessage(input: NewMessage): Promise<Message>;
  updateMessage(id: string, patch: Partial<Pick<Message, "content" | "model" | "feedback">>): Promise<Message | null>;
  deleteMessage(id: string): Promise<boolean>;
  /** Deletes every message in the conversation created after `afterCreatedAt` (exclusive). */
  deleteMessagesAfter(conversationId: string, afterCreatedAt: string): Promise<number>;

  getSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<UserSettings>;
}

export type { Feedback };
