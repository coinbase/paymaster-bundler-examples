import {
  createLimitOrder,
  createMarketOrder,
  getBestBidAsk,
  listAccounts,
  type OrderResult,
} from "./coinbaseTrade";

export type TradeSignal = {
  ticker?: string;
  symbol?: string;
  action?: string;
  side?: string;
  price?: string | number;
  quoteSize?: string | number;
  baseSize?: string | number;
  /** "market" (default) | "limit" — limit preferred for small-profit maker fills */
  orderType?: string;
  limitPrice?: string | number;
  postOnly?: boolean;
  source?: string;
  strategy?: string;
  /** Ignored unless TRADE_ALLOW_LIVE_OVERRIDE=true */
  dryRun?: boolean;
};

export type AgentDecision = {
  ok: boolean;
  dryRun: boolean;
  reason?: string;
  productId?: string;
  side?: "BUY" | "SELL";
  quoteSize?: string;
  baseSize?: string;
  orderType?: "market" | "limit";
  limitPrice?: string;
  order?: OrderResult | { preview: true; [k: string]: unknown };
};

/** Default quote for bare symbols like "BTC" / "ETH" (real spot base assets). */
function defaultQuoteCurrency(): string {
  const q = (process.env.TRADE_DEFAULT_QUOTE_CURRENCY || "EUR").trim().toUpperCase();
  return ["USD", "USDC", "EUR"].includes(q) ? q : "EUR";
}

function normalizeProduct(raw: string): string {
  const t = raw.trim().toUpperCase().replace("/", "-");
  if (t.includes("-")) return t;
  if (t.endsWith("USDC")) return `${t.slice(0, -4)}-USDC`;
  if (t.endsWith("EUR")) return `${t.slice(0, -3)}-EUR`;
  if (t.endsWith("USDT")) return `${t.slice(0, -4)}-USD`;
  if (t.endsWith("USD")) return `${t.slice(0, -3)}-USD`;
  return `${t}-${defaultQuoteCurrency()}`;
}

function normalizeSide(signal: TradeSignal): "BUY" | "SELL" | null {
  const raw = String(signal.action || signal.side || "")
    .trim()
    .toLowerCase();
  if (["buy", "long", "bid"].includes(raw)) return "BUY";
  if (["sell", "short", "ask"].includes(raw)) return "SELL";
  return null;
}

function allowedProducts(): Set<string> | "*" {
  const raw = (
    process.env.TRADE_ALLOWED_PRODUCTS || "ETH-EUR,BTC-EUR,XRP-EUR,SOL-EUR"
  ).trim();
  if (raw === "*" || raw.toLowerCase() === "all") return "*";
  const list = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return new Set(list);
}

/** Max notional per trade in EUR (BUY quote and SELL base×price). */
function maxNotionalEur(): number {
  return Number(
    process.env.TRADE_MAX_NOTIONAL_EUR ||
      process.env.TRADE_MAX_NOTIONAL_USD ||
      process.env.TRADE_MAX_QUOTE_USD ||
      "500",
  );
}

function defaultQuote(): string {
  return process.env.TRADE_DEFAULT_QUOTE_USD || "2";
}

function isProductAllowed(productId: string): boolean {
  const allowed = allowedProducts();
  if (allowed === "*") {
    return /-(USDC|USD|EUR)$/i.test(productId);
  }
  return allowed.has(productId);
}

function quoteCurrency(productId: string): string {
  const parts = productId.split("-");
  return parts[1] || defaultQuoteCurrency();
}

function baseCurrency(productId: string): string {
  return productId.split("-")[0] || productId;
}

async function publicPrice(productId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coinbase.com/api/v3/brokerage/market/products/${encodeURIComponent(productId)}/ticker`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      price?: string;
      trades?: Array<{ price?: string }>;
      best_bid?: string;
    };
    const px = Number(data.price ?? data.trades?.[0]?.price ?? data.best_bid);
    return Number.isFinite(px) && px > 0 ? px : null;
  } catch {
    return null;
  }
}

/** Convert an amount in quoteCurrency to EUR. */
async function toEur(amount: number, currency: string): Promise<number | null> {
  const c = currency.toUpperCase();
  if (c === "EUR") return amount;
  if (c === "USD" || c === "USDC") {
    // Prefer EUR-USD; fall back to ~1:1 if unavailable
    const eurUsd =
      (await publicPrice("EUR-USD")) || (await publicPrice("EUR-USDC"));
    if (eurUsd && eurUsd > 0) return amount / eurUsd;
    return amount; // soft fallback
  }
  return null;
}

/**
 * Env is source of truth. Client dryRun only honored when
 * TRADE_ALLOW_LIVE_OVERRIDE=true (and even then, dryRun:true always wins).
 */
function isDryRun(signal?: TradeSignal): boolean {
  const envDry =
    String(process.env.TRADE_DRY_RUN || "true").toLowerCase() !== "false";
  const allowOverride =
    String(process.env.TRADE_ALLOW_LIVE_OVERRIDE || "").toLowerCase() ===
    "true";

  if (!allowOverride) return envDry;
  if (envDry) return true;
  if (typeof signal?.dryRun === "boolean") return signal.dryRun;
  return false;
}

/**
 * Coinbase Advanced Trade agent: validates a signal, applies risk rails,
 * then places a market or limit (maker) order.
 */
export async function executeTradeSignal(
  signal: TradeSignal,
): Promise<AgentDecision> {
  const dryRun = isDryRun(signal);
  const ticker = signal.ticker || signal.symbol;
  if (!ticker) {
    return { ok: false, dryRun, reason: "missing ticker" };
  }

  const productId = normalizeProduct(String(ticker));
  const side = normalizeSide(signal);
  if (!side) {
    return {
      ok: false,
      dryRun,
      reason: `unknown action/side: ${signal.action || signal.side}`,
      productId,
    };
  }

  if (!isProductAllowed(productId)) {
    return {
      ok: false,
      dryRun,
      reason: `product not allowed: ${productId}`,
      productId,
      side,
    };
  }

  const maxEur = maxNotionalEur();
  const quote = quoteCurrency(productId);
  let quoteSize: string | undefined;
  let baseSize: string | undefined;
  const wantLimit =
    String(signal.orderType || "").toLowerCase() === "limit" ||
    signal.limitPrice != null;

  if (side === "BUY") {
    const q = Number(signal.quoteSize ?? defaultQuote());
    if (!Number.isFinite(q) || q <= 0) {
      return { ok: false, dryRun, reason: "invalid quoteSize", productId, side };
    }
    const qEur = await toEur(q, quote);
    if (qEur == null) {
      return {
        ok: false,
        dryRun,
        reason: `cannot convert ${quote}→EUR for cap check`,
        productId,
        side,
      };
    }
    if (qEur > maxEur) {
      return {
        ok: false,
        dryRun,
        reason: `buy ≈ €${qEur.toFixed(2)} exceeds TRADE_MAX_NOTIONAL_EUR=${maxEur}`,
        productId,
        side,
      };
    }
    quoteSize = q.toFixed(2);
  } else {
    if (signal.baseSize == null) {
      return {
        ok: false,
        dryRun,
        reason: "SELL requires baseSize",
        productId,
        side,
      };
    }
    const b = Number(signal.baseSize);
    if (!Number.isFinite(b) || b <= 0) {
      return { ok: false, dryRun, reason: "invalid baseSize", productId, side };
    }

    let px = Number(signal.price);
    if (!Number.isFinite(px) || px <= 0) {
      px = (await publicPrice(productId)) ?? NaN;
    }
    if (!Number.isFinite(px) || px <= 0) {
      return {
        ok: false,
        dryRun,
        reason: "cannot price SELL for € notional cap",
        productId,
        side,
      };
    }

    const notionalQuote = b * px;
    const notionalEur = await toEur(notionalQuote, quote);
    if (notionalEur == null) {
      return {
        ok: false,
        dryRun,
        reason: `cannot convert sell notional ${quote}→EUR`,
        productId,
        side,
      };
    }
    if (notionalEur > maxEur) {
      return {
        ok: false,
        dryRun,
        reason: `sell ≈ €${notionalEur.toFixed(2)} exceeds TRADE_MAX_NOTIONAL_EUR=${maxEur}`,
        productId,
        side,
      };
    }

    baseSize = String(signal.baseSize);
  }

  let limitPrice: string | undefined;
  let orderType: "market" | "limit" = "market";

  if (wantLimit) {
    let px = Number(signal.limitPrice);
    if (!Number.isFinite(px) || px <= 0) {
      try {
        const book = (await getBestBidAsk([productId])) as {
          pricebooks?: Array<{
            bids?: Array<{ price?: string }>;
            asks?: Array<{ price?: string }>;
          }>;
        };
        const book0 = book.pricebooks?.[0];
        const bid = Number(book0?.bids?.[0]?.price);
        const ask = Number(book0?.asks?.[0]?.price);
        if (side === "BUY" && Number.isFinite(bid)) px = bid;
        else if (side === "SELL" && Number.isFinite(ask)) px = ask;
        else if (Number.isFinite(ask) && Number.isFinite(bid)) {
          px = (bid + ask) / 2;
        }
      } catch {
        /* fall through */
      }
    }
    if (!Number.isFinite(px) || px <= 0) px = Number(signal.price);
    if (!Number.isFinite(px) || px <= 0) {
      return {
        ok: false,
        dryRun,
        reason: "limit order needs limitPrice",
        productId,
        side,
      };
    }
    limitPrice = px > 1000 ? px.toFixed(2) : px.toFixed(4);
    orderType = "limit";

    if (side === "BUY" && quoteSize && !baseSize) {
      const qty = Number(quoteSize) / Number(limitPrice);
      baseSize = qty > 1 ? qty.toFixed(6) : qty.toFixed(8);
    }
  }

  const preview = {
    productId,
    side,
    quoteSize,
    baseSize,
    orderType,
    limitPrice,
    postOnly: signal.postOnly !== false && orderType === "limit",
    source: signal.source,
    strategy: signal.strategy,
    price: signal.price,
  };

  if (dryRun) {
    console.log("trade agent dry-run", preview);
    return {
      ok: true,
      dryRun: true,
      productId,
      side,
      quoteSize,
      baseSize,
      orderType,
      limitPrice,
      order: { preview: true, ...preview },
      reason: "dry-run (set TRADE_DRY_RUN=false to live trade)",
    };
  }

  const accounts = await listAccounts();

  if (side === "BUY" && quoteSize) {
    const bal = accounts.find((a) => a.currency === quote);
    const avail = Number(bal?.available_balance?.value || 0);
    if (avail < Number(quoteSize)) {
      return {
        ok: false,
        dryRun: false,
        reason: `insufficient ${quote}: have ${avail}, need ${quoteSize}`,
        productId,
        side,
        quoteSize,
      };
    }
  }

  if (side === "SELL" && baseSize) {
    const cur = baseCurrency(productId);
    const acct = accounts.find((a) => a.currency === cur);
    const avail = Number(acct?.available_balance?.value || 0);
    if (avail < Number(baseSize)) {
      return {
        ok: false,
        dryRun: false,
        reason: `insufficient ${cur}: have ${avail}, need ${baseSize}`,
        productId,
        side,
        baseSize,
      };
    }
  }

  let order: OrderResult;
  if (orderType === "limit" && limitPrice && baseSize) {
    order = await createLimitOrder({
      productId,
      side,
      baseSize,
      limitPrice,
      postOnly: signal.postOnly !== false,
    });
  } else {
    order = await createMarketOrder({
      productId,
      side,
      quoteSize: side === "BUY" ? quoteSize : undefined,
      baseSize: side === "SELL" ? baseSize : undefined,
    });
  }

  console.log("trade agent order", {
    productId,
    side,
    orderType,
    success: order.success,
    order_id: order.order_id,
  });

  return {
    ok: Boolean(order.success),
    dryRun: false,
    productId,
    side,
    quoteSize,
    baseSize,
    orderType,
    limitPrice,
    order,
    reason: order.success
      ? undefined
      : JSON.stringify(order.error_response || order),
  };
}
