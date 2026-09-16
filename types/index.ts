export type Role = "system" | "user" | "assistant";

export type Feedback = "up" | "down";

export interface Conversation {
  id: string;
  title: string;
  titleIsCustom: boolean;
  /** Rolling summary of older messages used for context management. */
  summary: string | null;
  /** ISO timestamp of the last message covered by `summary`. */
  summaryThrough: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  model: string | null;
  feedback: Feedback | null;
  createdAt: string;
}

export type ModelTier = "fast" | "balanced" | "advanced";
export type Theme = "light" | "dark" | "system";

export interface UserSettings {
  theme: Theme;
  enterToSend: boolean;
  showTimestamps: boolean;
  renderMarkdown: boolean;
  modelTier: ModelTier;
  temperature: number;
  maxTokens: number;
  /** Custom system prompt; null means "use the built-in default". */
  systemPrompt: string | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "system",
  enterToSend: true,
  showTimestamps: true,
  renderMarkdown: true,
  modelTier: "balanced",
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: null,
};

export interface ModelTierInfo {
  tier: ModelTier;
  label: string;
  description: string;
  /** The real model id this tier maps to. */
  model: string;
}

export type AuthMode = "supabase" | "demo";

export interface AppStatus {
  ai: {
    configured: boolean;
    provider: string;
    tiers: ModelTierInfo[];
    /** Present when not configured — tells the person what to set. */
    setupMessage: string | null;
  };
  auth: {
    mode: AuthMode;
    email: string | null;
  };
  limits: {
    maxMessageChars: number;
  };
}

export type ChatAction = "send" | "regenerate" | "edit";

export interface ChatRequestBody {
  action: ChatAction;
  conversationId?: string;
  content?: string;
  messageId?: string;
  modelTier?: ModelTier;
}

/** NDJSON events streamed from POST /api/chat. */
export type ChatStreamEvent =
  | { type: "meta"; conversationId: string; userMessageId: string | null; assistantMessageId: string; model: string; createdAt: string }
  | { type: "delta"; text: string }
  | { type: "done"; title?: string; stopped?: boolean }
  | { type: "error"; code: string; message: string };

export interface ConversationPage {
  items: Conversation[];
  nextCursor: string | null;
}

export interface SearchResult {
  conversation: Conversation;
  /** Short excerpt of the matching message, if the hit was in a message. */
  snippet: string | null;
}
