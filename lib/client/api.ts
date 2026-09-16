/** Small fetch wrapper for the app's own JSON API. Throws ApiClientError with a user-safe message. */

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export async function readErrorResponse(res: Response): Promise<ApiClientError> {
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiClientError(data.error?.code ?? "error", data.error?.message ?? `Request failed (${res.status}).`, res.status);
  } catch {
    return new ApiClientError("error", res.status === 401 ? "Please sign in again." : `Request failed (${res.status}).`, res.status);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError("network", "You appear to be offline. Check your connection and try again.", 0);
  }
  if (!res.ok) throw await readErrorResponse(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
