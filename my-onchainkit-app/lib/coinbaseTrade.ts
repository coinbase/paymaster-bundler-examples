import { randomBytes, randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import jwt from "jsonwebtoken";

const HOST = "api.coinbase.com";
const BASE = `https://${HOST}`;

type KeyMaterial = { apiKeyId: string; apiKeySecret: string };

function loadKeys(): KeyMaterial {
  const file =
    process.env.CDP_API_KEY_FILE || process.env.COINBASE_KEY_FILE || "";
  if (file && existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      string
    >;
    const apiKeyId = raw.name || raw.id;
    const apiKeySecret =
      raw.privateKey || raw.private_key || raw.api_key_secret;
    if (!apiKeyId || !apiKeySecret) {
      throw new Error("CDP key file missing name/id or privateKey");
    }
    return { apiKeyId, apiKeySecret };
  }

  const apiKeyId = process.env.CDP_API_KEY_ID || process.env.KEY_NAME;
  const apiKeySecret =
    process.env.CDP_API_KEY_SECRET || process.env.KEY_SECRET;
  if (!apiKeyId || !apiKeySecret) {
    throw new Error(
      "Set CDP_API_KEY_FILE or CDP_API_KEY_ID + CDP_API_KEY_SECRET",
    );
  }
  return {
    apiKeyId,
    apiKeySecret: apiKeySecret.includes("\\n")
      ? apiKeySecret.replace(/\\n/g, "\n")
      : apiKeySecret,
  };
}

function signJwt(method: string, path: string): string {
  const { apiKeyId, apiKeySecret } = loadKeys();
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: "cdp",
      nbf: now,
      exp: now + 120,
      sub: apiKeyId,
      uri: `${method} ${HOST}${path}`,
    },
    apiKeySecret,
    {
      algorithm: "ES256",
      header: {
        alg: "ES256",
        kid: apiKeyId,
        nonce: randomBytes(16).toString("hex"),
        typ: "JWT",
      } as jwt.JwtHeader,
    },
  );
}

async function brokerage<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const token = signJwt(method, path);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "error" in data
        ? JSON.stringify((data as { error: unknown }).error)
        : text.slice(0, 300);
    throw new Error(`Coinbase ${method} ${path} → ${res.status}: ${msg}`);
  }
  return data as T;
}

export type Account = {
  uuid: string;
  name: string;
  currency: string;
  available_balance: { value: string; currency: string };
  hold?: { value: string; currency: string };
};

export async function listAccounts(): Promise<Account[]> {
  const data = await brokerage<{ accounts: Account[] }>(
    "GET",
    "/api/v3/brokerage/accounts",
  );
  return data.accounts || [];
}

export type MarketOrderInput = {
  productId: string;
  side: "BUY" | "SELL";
  /** Spend this quote amount (e.g. USDC) on a BUY */
  quoteSize?: string;
  /** Sell this base amount (e.g. BTC) on a SELL */
  baseSize?: string;
  clientOrderId?: string;
};

export type LimitOrderInput = {
  productId: string;
  side: "BUY" | "SELL";
  baseSize: string;
  limitPrice: string;
  /** Prefer maker (resting) fills when true */
  postOnly?: boolean;
  clientOrderId?: string;
};

export type OrderResult = {
  success: boolean;
  order_id?: string;
  error_response?: unknown;
  [key: string]: unknown;
};

export async function createMarketOrder(
  input: MarketOrderInput,
): Promise<OrderResult> {
  if (!input.quoteSize && !input.baseSize) {
    throw new Error("Provide quoteSize (BUY) or baseSize (SELL)");
  }

  const order_configuration = input.quoteSize
    ? { market_market_ioc: { quote_size: String(input.quoteSize) } }
    : { market_market_ioc: { base_size: String(input.baseSize) } };

  return brokerage<OrderResult>("POST", "/api/v3/brokerage/orders", {
    client_order_id: input.clientOrderId || randomUUID(),
    product_id: input.productId,
    side: input.side,
    order_configuration,
  });
}

/** Limit GTC — use post_only for maker (lower fees) when possible. */
export async function createLimitOrder(
  input: LimitOrderInput,
): Promise<OrderResult> {
  const base = Number(input.baseSize);
  const px = Number(input.limitPrice);
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error("limit order requires positive baseSize");
  }
  if (!Number.isFinite(px) || px <= 0) {
    throw new Error("limit order requires positive limitPrice");
  }

  return brokerage<OrderResult>("POST", "/api/v3/brokerage/orders", {
    client_order_id: input.clientOrderId || randomUUID(),
    product_id: input.productId,
    side: input.side,
    order_configuration: {
      limit_limit_gtc: {
        base_size: String(input.baseSize),
        limit_price: String(input.limitPrice),
        post_only: Boolean(input.postOnly),
      },
    },
  });
}

export async function getProduct(productId: string) {
  return brokerage<Record<string, unknown>>(
    "GET",
    `/api/v3/brokerage/products/${encodeURIComponent(productId)}`,
  );
}

export async function getBestBidAsk(productIds: string[]) {
  const q = productIds.map(encodeURIComponent).join(",");
  return brokerage<Record<string, unknown>>(
    "GET",
    `/api/v3/brokerage/best_bid_ask?product_ids=${q}`,
  );
}

export type BrokerageOrder = {
  order_id?: string;
  product_id?: string;
  side?: string;
  status?: string;
  filled_size?: string;
  average_filled_price?: string;
  total_fees?: string;
  number_of_fills?: string;
  pending_cancel?: boolean;
  [key: string]: unknown;
};

export async function getOrder(orderId: string): Promise<BrokerageOrder> {
  const data = await brokerage<{ order?: BrokerageOrder }>(
    "GET",
    `/api/v3/brokerage/orders/historical/${encodeURIComponent(orderId)}`,
  );
  return data.order || (data as unknown as BrokerageOrder);
}

export async function cancelOrders(orderIds: string[]): Promise<unknown> {
  return brokerage("POST", "/api/v3/brokerage/orders/batch_cancel", {
    order_ids: orderIds,
  });
}

