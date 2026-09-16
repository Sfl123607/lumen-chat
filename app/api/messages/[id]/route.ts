import { AppError } from "@/lib/errors";
import { handler, json, parseBody, withContext } from "@/lib/server/api";
import { messagePatchSchema, uuid } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/messages/:id — like / dislike feedback. */
export const PATCH = handler(async (req: Request, { params }: Params) => {
  const { store } = await withContext();
  const { id } = await params;
  const parsed = uuid.safeParse(id);
  if (!parsed.success) throw new AppError("not_found", "Message not found.");
  const body = await parseBody(req, messagePatchSchema);
  const message = await store.updateMessage(parsed.data, { feedback: body.feedback });
  if (!message) throw new AppError("not_found", "Message not found.");
  return json(message);
});
