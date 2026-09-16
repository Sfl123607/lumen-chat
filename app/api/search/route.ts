import { handler, json, withContext } from "@/lib/server/api";
import { searchQuerySchema } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

/** GET /api/search?q= — searches conversation titles and message content. */
export const GET = handler(async (req: Request) => {
  const { store } = await withContext();
  const q = searchQuerySchema.safeParse(new URL(req.url).searchParams.get("q") ?? "");
  if (!q.success) return json({ results: [] });
  const results = await store.searchConversations(q.data, 20);
  return json({ results });
});
