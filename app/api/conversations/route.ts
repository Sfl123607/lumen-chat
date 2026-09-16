import { z } from "zod";
import { handler, json, parseBody, withContext } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/conversations?cursor=&limit= — paginated, most recent first. */
export const GET = handler(async (req: Request) => {
  const { store } = await withContext();
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 30) || 30, 1), 100);
  const cursor = url.searchParams.get("cursor");
  const page = await store.listConversations({ cursor, limit });
  return json(page);
});

/** POST /api/conversations — create an empty conversation (title optional). */
export const POST = handler(async (req: Request) => {
  const { store } = await withContext();
  const body = await parseBody(req, z.object({ title: z.string().trim().max(120).optional() }));
  const conv = await store.createConversation(body.title || "New chat");
  return json(conv, { status: 201 });
});

/** DELETE /api/conversations — clear the user's entire history. */
export const DELETE = handler(async () => {
  const { store } = await withContext();
  const deleted = await store.deleteAllConversations();
  return json({ deleted });
});
