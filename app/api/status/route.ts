import { aiSetupMessage, env, getProviderName, isAIConfigured } from "@/lib/env";
import { listTiers } from "@/lib/ai/config";
import { getSession } from "@/lib/auth/session";
import { handler, json } from "@/lib/server/api";
import type { AppStatus } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/status — what is configured, so the UI never pretends. */
export const GET = handler(async () => {
  const session = await getSession();
  const status: AppStatus = {
    ai: {
      configured: isAIConfigured(),
      provider: getProviderName(),
      tiers: listTiers(),
      setupMessage: aiSetupMessage(),
    },
    auth: {
      mode: session?.mode ?? "demo",
      email: session?.email ?? null,
    },
    limits: { maxMessageChars: env.maxMessageChars },
  };
  return json(status);
});
