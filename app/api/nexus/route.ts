import { NextResponse, type NextRequest } from "next/server";
import { getProvider } from "@/lib/ai";
import { resolveModel } from "@/lib/ai/config";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import type { ChatMessage } from "@/lib/ai/types";
import { AppError, toAppError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/server/rate-limit";
import type { ModelTier } from "@/types";

/**
 * Public, CORS-enabled endpoint used by the NEXUS games hub.
 *
 * Unlike /api/chat this needs no session: the browser sends a plain
 * { messages, system?, model? } body and gets back { reply }. The server's own
 * provider key does the work, so embedders never hold a key.
 *
 * Abuse controls: 20 requests/minute per IP, a hard cap on payload size, and an
 * optional shared secret (set NEXUS_API_KEY to require `Authorization: Bearer …`).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32_000;
const MAX_MESSAGES = 20;
const RATE_LIMIT_PER_MINUTE = 20;
const TIERS: ModelTier[] = ["fast", "balanced", "advanced"];

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.NEXUS_API_KEY;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new AppError("unauthorized", "This endpoint requires a key.");
    }

    checkRateLimit(`nexus:${clientIp(req)}`, RATE_LIMIT_PER_MINUTE);

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      throw new AppError("payload_too_large", "That message is too long. Try shortening it.");
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AppError("bad_request", "Expected a JSON body.");
    }

    const { messages, system, model } = (body ?? {}) as {
      messages?: unknown;
      system?: unknown;
      model?: unknown;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new AppError("bad_request", "Send a non-empty `messages` array.");
    }

    const chat: ChatMessage[] = messages.slice(-MAX_MESSAGES).map((m) => {
      const { role, content } = (m ?? {}) as { role?: unknown; content?: unknown };
      if (typeof content !== "string" || !content.trim()) {
        throw new AppError("bad_request", "Every message needs non-empty string content.");
      }
      return { role: role === "assistant" ? "assistant" : "user", content };
    });

    const tier: ModelTier = TIERS.includes(model as ModelTier) ? (model as ModelTier) : "balanced";

    const reply = await getProvider().complete(chat, {
      model: resolveModel(tier),
      system: typeof system === "string" && system.trim() ? system : DEFAULT_SYSTEM_PROMPT,
      temperature: 0.7,
      maxTokens: 1500,
    });

    return json({ reply });
  } catch (err) {
    const appErr = toAppError(err);
    return json({ error: { code: appErr.code, message: appErr.message } }, appErr.status);
  }
}
