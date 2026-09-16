import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { AppError, toAppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { requireSession, type Session } from "@/lib/auth/session";
import { getStore, type ConversationStore } from "@/lib/store";

export const MAX_JSON_BODY_BYTES = 256 * 1024;

export interface RequestContext {
  session: Session;
  store: ConversationStore;
}

/** Authenticates, applies the general API rate limit and builds the per-user store. */
export async function withContext(kind: "api" | "chat" = "api"): Promise<RequestContext> {
  const session = await requireSession();
  const limit = kind === "chat" ? env.rateLimitChatPerMinute : env.rateLimitApiPerMinute;
  checkRateLimit(`${kind}:${session.userId}`, limit);
  return { session, store: getStore(session) };
}

/** Parses and validates a JSON body with a size cap. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_JSON_BODY_BYTES) throw new AppError("payload_too_large", "The request is too large.");
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new AppError("bad_request", "Couldn't read the request body.");
  }
  if (text.length > MAX_JSON_BODY_BYTES) throw new AppError("payload_too_large", "The request is too large.");
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("bad_request", "The request body must be valid JSON.");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError("bad_request", issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request.");
  }
  return result.data;
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown): NextResponse {
  const appErr = toAppError(err);
  return NextResponse.json({ error: { code: appErr.code, message: appErr.message } }, { status: appErr.status });
}

/** Wraps a route handler so thrown errors become clean JSON responses. */
export function handler<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
