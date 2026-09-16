import { handler, json, parseBody, withContext } from "@/lib/server/api";
import { settingsSchema } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { store } = await withContext();
  return json(await store.getSettings());
});

export const PUT = handler(async (req: Request) => {
  const { store } = await withContext();
  const body = await parseBody(req, settingsSchema);
  return json(await store.saveSettings(body));
});
