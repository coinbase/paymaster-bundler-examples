import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function allowQuerySecret(): boolean {
  // Default off in production; set ALLOW_QUERY_SECRET=true only for local debugging.
  if (String(process.env.ALLOW_QUERY_SECRET || "").toLowerCase() === "true") {
    return true;
  }
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV;
  return env !== "production";
}

/**
 * Extract shared secret from header / body only (query blocked in production).
 */
export function extractSharedSecret(
  request: NextRequest,
  opts: {
    body?: Record<string, unknown> | null;
    raw?: string;
    headerNames?: string[];
  } = {},
): { secret: string | null; rejectedQuery: boolean } {
  const headers = opts.headerNames ?? [
    "x-trade-secret",
    "x-tradingview-secret",
    "x-webhook-secret",
  ];

  for (const name of headers) {
    const v = request.headers.get(name);
    if (v) return { secret: v, rejectedQuery: false };
  }

  const fromQuery = request.nextUrl.searchParams.get("secret");
  if (fromQuery) {
    if (!allowQuerySecret()) {
      return { secret: null, rejectedQuery: true };
    }
    return { secret: fromQuery, rejectedQuery: false };
  }

  if (opts.body && typeof opts.body.secret === "string") {
    return { secret: opts.body.secret, rejectedQuery: false };
  }

  if (opts.raw) {
    const match = opts.raw.match(/(?:^|\n)\s*secret\s*[:=]\s*(\S+)/i);
    if (match?.[1]) return { secret: match[1], rejectedQuery: false };
  }

  return { secret: null, rejectedQuery: false };
}
