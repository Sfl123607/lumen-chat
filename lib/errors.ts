export type AppErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "payload_too_large"
  | "not_configured"
  | "provider_auth"
  | "provider_rate_limit"
  | "provider_timeout"
  | "provider_error"
  | "network"
  | "database"
  | "internal";

const STATUS: Record<AppErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  payload_too_large: 413,
  not_configured: 503,
  provider_auth: 502,
  provider_rate_limit: 429,
  provider_timeout: 504,
  provider_error: 502,
  network: 502,
  database: 500,
  internal: 500,
};

/**
 * An error whose `message` is safe to show to end users.
 * Anything else that bubbles up is logged and replaced with a generic message.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
  }
}

export const GENERIC_ERROR_MESSAGE = "Something went wrong while generating the response. Please try again.";

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    if (err.name === "AbortError") return new AppError("provider_timeout", "The request was cancelled or timed out.");
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network/i.test(err.message)) {
      return new AppError("network", "Couldn't reach the AI provider. Check your network connection and try again.");
    }
  }
  console.error("[unhandled]", err);
  return new AppError("internal", "Something went wrong. Please try again.");
}
