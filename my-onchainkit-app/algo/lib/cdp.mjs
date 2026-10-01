/**
 * CDP Advanced Trade helpers for the algo runner (JWT ES256).
 */
import { readFileSync, existsSync } from "fs";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";

const HOST = "api.coinbase.com";

function loadKeys() {
  const file = process.env.CDP_API_KEY_FILE || "";
  if (file && existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return {
      apiKeyId: raw.name || raw.id,
      apiKeySecret: raw.privateKey || raw.private_key || raw.api_key_secret,
    };
  }
  const apiKeyId = process.env.CDP_API_KEY_ID;
  let apiKeySecret = process.env.CDP_API_KEY_SECRET || "";
  if (apiKeySecret.includes("\\n")) {
    apiKeySecret = apiKeySecret.replace(/\\n/g, "\n");
  }
  if (!apiKeyId || !apiKeySecret) return null;
  return { apiKeyId, apiKeySecret };
}

async function brokerage(method, path, body) {
  const keys = loadKeys();
  if (!keys) throw new Error("CDP keys missing");
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      iss: "cdp",
      nbf: now,
      exp: now + 120,
      sub: keys.apiKeyId,
      uri: `${method} ${HOST}${path}`,
    },
    keys.apiKeySecret,
    {
      algorithm: "ES256",
      header: {
        alg: "ES256",
        kid: keys.apiKeyId,
        nonce: randomBytes(16).toString("hex"),
        typ: "JWT",
      },
    },
  );
  const res = await fetch(`https://${HOST}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Coinbase ${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

export async function fetchBalances() {
  const data = await brokerage("GET", "/api/v3/brokerage/accounts");
  return (data.accounts || []).map((a) => ({
    currency: String(a.currency).toUpperCase(),
    available: Number(a.available_balance?.value || 0),
    hold: Number(a.hold?.value || 0),
  }));
}

export async function getOrder(orderId) {
  const data = await brokerage(
    "GET",
    `/api/v3/brokerage/orders/historical/${encodeURIComponent(orderId)}`,
  );
  return data.order || data;
}

export async function cancelOrder(orderId) {
  return brokerage("POST", "/api/v3/brokerage/orders/batch_cancel", {
    order_ids: [orderId],
  });
}

export async function getSpreadPct(productId) {
  // Prefer public market endpoint (no special product auth quirks)
  try {
    const res = await fetch(
      `https://api.coinbase.com/api/v3/brokerage/market/products/${encodeURIComponent(productId)}/ticker`,
    );
    if (res.ok) {
      const t = await res.json();
      // ticker may only have price — fall through to book if no bid/ask
      const bid = Number(t.bid || t.best_bid);
      const ask = Number(t.ask || t.best_ask);
      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0) {
        const mid = (bid + ask) / 2;
        return { bid, ask, mid, spreadPct: ((ask - bid) / mid) * 100 };
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const data = await brokerage(
      "GET",
      `/api/v3/brokerage/best_bid_ask?product_ids=${encodeURIComponent(productId)}`,
    );
    const book = data.pricebooks?.[0];
    const bid = Number(book?.bids?.[0]?.price);
    const ask = Number(book?.asks?.[0]?.price);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0) return null;
    const mid = (bid + ask) / 2;
    return { bid, ask, mid, spreadPct: ((ask - bid) / mid) * 100 };
  } catch {
    // Last resort: approximate with product book public
    const res = await fetch(
      `https://api.coinbase.com/api/v3/brokerage/market/product_book?product_id=${encodeURIComponent(productId)}&limit=1`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const bid = Number(data.pricebook?.bids?.[0]?.price);
    const ask = Number(data.pricebook?.asks?.[0]?.price);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0) return null;
    const mid = (bid + ask) / 2;
    return { bid, ask, mid, spreadPct: ((ask - bid) / mid) * 100 };
  }
}
