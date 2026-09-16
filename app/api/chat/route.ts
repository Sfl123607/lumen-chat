import { AppError, toAppError } from "@/lib/errors";
import { getProvider } from "@/lib/ai";
import { resolveModel } from "@/lib/ai/config";
import { buildContext } from "@/lib/ai/context";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { fallbackTitle, generateTitle } from "@/lib/ai/title";
import { errorResponse, parseBody, withContext } from "@/lib/server/api";
import { chatRequestSchema } from "@/lib/server/validation";
import { LIMITS } from "@/lib/store";
import type { ChatStreamEvent, Conversation, Message } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 *
 * Streams the assistant reply as newline-delimited JSON events
 * (see ChatStreamEvent). The assistant message row is created before
 * streaming so the client knows its id immediately, and the final content
 * is written when the stream completes, errors, or is stopped by the client.
 */
export async function POST(req: Request) {
  let prepared: Awaited<ReturnType<typeof prepare>>;
  try {
    prepared = await prepare(req);
  } catch (err) {
    return errorResponse(err);
  }

  const { store, conversation, history, assistant, userMessage, model, settings, isNewConversation, provider } = prepared;
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let generated = "";
  let finalized = false;

  const finalize = async (opts: { stopped?: boolean; failed?: boolean }) => {
    if (finalized) return;
    finalized = true;
    try {
      if (generated.trim().length > 0) {
        await store.updateMessage(assistant.id, { content: generated });
        await store.updateConversation(conversation.id, { touch: true });
      } else {
        // Nothing useful was produced: don't leave an empty assistant row behind.
        await store.deleteMessage(assistant.id);
        if (opts.failed && userMessage) await store.updateConversation(conversation.id, { touch: true });
      }
    } catch (err) {
      console.error("[chat] finalize failed", err);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (evt: ChatStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(evt)}\n`));
        } catch {
          /* client went away */
        }
      };

      send({
        type: "meta",
        conversationId: conversation.id,
        userMessageId: userMessage?.id ?? null,
        assistantMessageId: assistant.id,
        model,
        createdAt: assistant.createdAt,
      });

      try {
        const { messages, summaryUpdate } = await buildContext(conversation, history, provider, model, settings.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);
        if (summaryUpdate) {
          await store.updateConversation(conversation.id, summaryUpdate).catch((e) => console.warn("[chat] summary save failed", e));
        }

        for await (const delta of provider.stream(messages, {
          model,
          system: settings.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          signal: abort.signal,
        })) {
          generated += delta;
          send({ type: "delta", text: delta });
        }

        await finalize({});

        let title: string | undefined;
        if (isNewConversation && userMessage && !conversation.titleIsCustom) {
          const generatedTitle = await generateTitle(provider, resolveModel("fast"), userMessage.content, generated);
          if (generatedTitle) {
            await store.updateConversation(conversation.id, { title: generatedTitle });
            title = generatedTitle;
          }
        }
        send({ type: "done", title });
      } catch (err) {
        if (abort.signal.aborted) {
          await finalize({ stopped: true });
          send({ type: "done", stopped: true });
        } else {
          const appErr = toAppError(err);
          await finalize({ failed: true });
          send({ type: "error", code: appErr.code, message: appErr.message });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    async cancel() {
      // Client pressed Stop (or disconnected). Abort the upstream request and keep what was generated.
      abort.abort();
      await finalize({ stopped: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Everything that can fail before streaming starts, so errors get a normal JSON response. */
async function prepare(req: Request) {
  const { store } = await withContext("chat");
  const body = await parseBody(req, chatRequestSchema);
  const provider = getProvider(); // throws not_configured with a setup message
  const settings = await store.getSettings();
  const tier = body.modelTier ?? settings.modelTier;
  const model = resolveModel(tier);

  let conversation: Conversation | null = null;
  let userMessage: Message | null = null;
  let isNewConversation = false;

  if (body.action === "send") {
    if (body.conversationId) {
      conversation = await store.getConversation(body.conversationId);
      if (!conversation) throw new AppError("not_found", "That conversation no longer exists.");
    } else {
      const count = await store.countConversations();
      if (count >= LIMITS.maxConversationsPerUser) {
        throw new AppError("bad_request", `You've reached the limit of ${LIMITS.maxConversationsPerUser} conversations. Delete some to continue.`);
      }
      conversation = await store.createConversation(fallbackTitle(body.content!));
      isNewConversation = true;
    }
    const existing = await store.listMessages(conversation.id);
    if (existing.length >= LIMITS.maxMessagesPerConversation) {
      throw new AppError("bad_request", "This conversation has reached its message limit. Start a new chat to continue.");
    }
    userMessage = await store.addMessage({ conversationId: conversation.id, role: "user", content: body.content! });
    if (existing.length === 0) isNewConversation = true; // first message in an empty conversation
  } else if (body.action === "edit") {
    conversation = await store.getConversation(body.conversationId!);
    if (!conversation) throw new AppError("not_found", "That conversation no longer exists.");
    const target = await store.getMessage(body.messageId!);
    if (!target || target.conversationId !== conversation.id || target.role !== "user") {
      throw new AppError("not_found", "That message can't be edited.");
    }
    await store.deleteMessagesAfter(conversation.id, target.createdAt);
    userMessage = await store.updateMessage(target.id, { content: body.content! });
    if (!userMessage) throw new AppError("not_found", "That message can't be edited.");
    const all = await store.listMessages(conversation.id);
    if (all[0]?.id === target.id && !conversation.titleIsCustom) isNewConversation = true; // regenerate title too
  } else {
    conversation = await store.getConversation(body.conversationId!);
    if (!conversation) throw new AppError("not_found", "That conversation no longer exists.");
    const all = await store.listMessages(conversation.id);
    // Drop trailing assistant messages so we regenerate the reply to the last user turn.
    let lastUserIdx = -1;
    for (let i = all.length - 1; i >= 0; i--) if (all[i]!.role === "user") { lastUserIdx = i; break; }
    if (lastUserIdx === -1) throw new AppError("bad_request", "There's nothing to regenerate yet.");
    await store.deleteMessagesAfter(conversation.id, all[lastUserIdx]!.createdAt);
    userMessage = all[lastUserIdx]!;
    if (lastUserIdx === 0 && !conversation.titleIsCustom) isNewConversation = true;
  }

  const history = await store.listMessages(conversation.id);
  const assistant = await store.addMessage({ conversationId: conversation.id, role: "assistant", content: "", model });

  return { store, conversation, history, assistant, userMessage, model, settings, isNewConversation, provider };
}
