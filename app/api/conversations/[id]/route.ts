import { AppError } from "@/lib/errors";
import { handler, json, parseBody, withContext } from "@/lib/server/api";
import { conversationPatchSchema, uuid } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function parseId(params: Params["params"]) {
  const { id } = await params;
  const parsed = uuid.safeParse(id);
  if (!parsed.success) throw new AppError("not_found", "Conversation not found.");
  return parsed.data;
}

/** GET /api/conversations/:id — conversation with all its messages. */
export const GET = handler(async (_req: Request, { params }: Params) => {
  const { store } = await withContext();
  const id = await parseId(params);
  const conversation = await store.getConversation(id);
  if (!conversation) throw new AppError("not_found", "Conversation not found.");
  const messages = await store.listMessages(id);
  return json({ conversation, messages });
});

/** PATCH /api/conversations/:id — rename. */
export const PATCH = handler(async (req: Request, { params }: Params) => {
  const { store } = await withContext();
  const id = await parseId(params);
  const body = await parseBody(req, conversationPatchSchema);
  const conversation = await store.updateConversation(id, { title: body.title, titleIsCustom: true });
  if (!conversation) throw new AppError("not_found", "Conversation not found.");
  return json(conversation);
});

/** DELETE /api/conversations/:id */
export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const { store } = await withContext();
  const id = await parseId(params);
  const ok = await store.deleteConversation(id);
  if (!ok) throw new AppError("not_found", "Conversation not found.");
  return json({ ok: true });
});
