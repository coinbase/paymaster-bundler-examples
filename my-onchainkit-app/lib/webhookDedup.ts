import { createHash } from "crypto";

type Entry = { expiresAt: number };

/** In-memory idempotency store (per serverless instance). */
const seen = new Map<string, Entry>();

function prune(now: number) {
  for (const [k, v] of seen) {
    if (v.expiresAt <= now) seen.delete(k);
  }
}

/**
 * Returns true if this key was already seen within ttlMs (replay).
 * Returns false and records the key on first sight.
 */
export function isReplay(
  key: string,
  ttlMs = Number(process.env.WEBHOOK_DEDUP_TTL_MS || 300_000),
): boolean {
  const now = Date.now();
  prune(now);
  const existing = seen.get(key);
  if (existing && existing.expiresAt > now) return true;
  seen.set(key, { expiresAt: now + ttlMs });
  return false;
}

export function alertDedupeKey(parts: {
  ticker?: unknown;
  action?: unknown;
  price?: unknown;
  time?: unknown;
  interval?: unknown;
  strategy?: unknown;
  raw?: string;
}): string {
  const material = [
    String(parts.ticker ?? ""),
    String(parts.action ?? ""),
    String(parts.price ?? ""),
    String(parts.time ?? ""),
    String(parts.interval ?? ""),
    String(parts.strategy ?? ""),
    // Fallback: hash truncated raw body when TV fields are sparse
    parts.raw ? createHash("sha256").update(parts.raw).digest("hex").slice(0, 16) : "",
  ].join("|");
  return createHash("sha256").update(material).digest("hex");
}
