import { z } from "zod";
import { env } from "@/lib/env";

export const uuid = z.string().uuid();

export const messageContent = () =>
  z
    .string()
    .transform((s) => s.replace(/\r\n/g, "\n").replace(/\u0000/g, ""))
    .refine((s) => s.trim().length > 0, "Message can't be empty.")
    .refine((s) => s.length <= env.maxMessageChars, `Message is too long (max ${env.maxMessageChars.toLocaleString()} characters).`);

export const modelTier = z.enum(["fast", "balanced", "advanced"]);

export const chatRequestSchema = z
  .object({
    action: z.enum(["send", "regenerate", "edit"]),
    conversationId: uuid.optional(),
    content: messageContent().optional(),
    messageId: uuid.optional(),
    modelTier: modelTier.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === "send" && !v.content) ctx.addIssue({ code: "custom", path: ["content"], message: "Message can't be empty." });
    if (v.action === "edit" && (!v.content || !v.messageId || !v.conversationId)) {
      ctx.addIssue({ code: "custom", path: ["messageId"], message: "Editing needs a conversation, message id and new content." });
    }
    if (v.action === "regenerate" && !v.conversationId) ctx.addIssue({ code: "custom", path: ["conversationId"], message: "Regenerate needs a conversation." });
  });

export const conversationPatchSchema = z.object({
  title: z.string().trim().min(1, "Title can't be empty.").max(120, "Title is too long (max 120 characters)."),
});

export const messagePatchSchema = z.object({
  feedback: z.enum(["up", "down"]).nullable(),
});

export const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  enterToSend: z.boolean(),
  showTimestamps: z.boolean(),
  renderMarkdown: z.boolean(),
  modelTier,
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(64).max(16384),
  systemPrompt: z.string().max(8000, "System prompt is too long (max 8,000 characters).").nullable(),
});

export const searchQuerySchema = z.string().trim().min(1).max(100);
