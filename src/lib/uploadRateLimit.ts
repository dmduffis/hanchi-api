/** Simple in-process rate limit: N uploads per window per user. */

const hits = new Map<string, number[]>();

const WINDOW_MS = 60 * 60 * 1000;

function maxPerHour(): number {
  const n = Number(process.env.MEDIA_UPLOADS_PER_HOUR ?? 20);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function assertUploadRateLimit(userId: string):
  | { ok: true }
  | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const prev = (hits.get(userId) ?? []).filter((t) => t >= windowStart);
  if (prev.length >= maxPerHour()) {
    const oldest = prev[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + WINDOW_MS - now) / 1000),
    );
    hits.set(userId, prev);
    return { ok: false, retryAfterSec };
  }
  prev.push(now);
  hits.set(userId, prev);
  return { ok: true };
}
