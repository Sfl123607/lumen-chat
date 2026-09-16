import { AppError } from "@/lib/errors";

/**
 * In-memory sliding-window limiter. Sufficient for a single server instance;
 * swap `check` for a Redis/Upstash implementation when running many instances.
 */
const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;
let lastSweep = Date.now();

function sweep() {
  const now = Date.now();
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

export function checkRateLimit(key: string, limitPerMinute: number): void {
  sweep();
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limitPerMinute) {
    const retryIn = Math.ceil((WINDOW_MS - (now - hits[0]!)) / 1000);
    throw new AppError("rate_limited", `You're sending requests too quickly. Try again in ${retryIn}s.`);
  }
  hits.push(now);
  buckets.set(key, hits);
}
