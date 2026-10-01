import { NextRequest, NextResponse } from "next/server";
import { extractSharedSecret, secretsMatch } from "@/lib/authSecret";
import { listAccounts, getBestBidAsk } from "@/lib/coinbaseTrade";
import { executeTradeSignal } from "@/lib/tradeAgent";

export const runtime = "nodejs";

function authorized(
  request: NextRequest,
  body: Record<string, unknown> | null,
): { ok: boolean; rejectedQuery?: boolean } {
  const expected = process.env.TRADE_API_SECRET;
  if (!expected) return { ok: false };
  const { secret, rejectedQuery } = extractSharedSecret(request, {
    body,
    headerNames: ["x-trade-secret", "x-webhook-secret"],
  });
  if (rejectedQuery) return { ok: false, rejectedQuery: true };
  if (!secret || !secretsMatch(secret, expected)) return { ok: false };
  return { ok: true };
}

type Intent =
  | { type: "balance" }
  | { type: "price"; product: string }
  | {
      type: "trade";
      action: string;
      product: string;
      quoteSize?: string;
      baseSize?: string;
    }
  | { type: "help" };

function parseIntent(message: string): Intent {
  const m = message.trim().toLowerCase();
  if (!m || (/help|\?/.test(m) && m.length < 12)) return { type: "help" };
  if (/balance|portfolio|holdings|accounts/.test(m)) return { type: "balance" };

  const productMatch =
    m.match(/\b([a-z]{2,10})[-\/]?(usdc|usd|usdt|eur)\b/i) ||
    m.match(/\b(btc|eth|sol|ast|pol)\b/i);
  const defaultQuote = (
    process.env.TRADE_DEFAULT_QUOTE_CURRENCY || "USD"
  ).toUpperCase();
  let product = `BTC-${defaultQuote}`;
  if (productMatch) {
    if (productMatch[2]) {
      const quote = productMatch[2].toUpperCase().replace("USDT", "USD");
      product = `${productMatch[1].toUpperCase()}-${quote}`;
    } else {
      product = `${productMatch[1].toUpperCase()}-${defaultQuote}`;
    }
  }

  if (/price|quote|ticker|how much/.test(m)) {
    return { type: "price", product };
  }

  const buy = /\b(buy|long)\b/.test(m);
  const sell = /\b(sell|short)\b/.test(m);
  if (buy || sell) {
    const amt = m.match(/\$?\s*(\d+(?:\.\d+)?)\s*(usdc|usd)?/);
    return {
      type: "trade",
      action: buy ? "buy" : "sell",
      product,
      quoteSize: buy ? amt?.[1] : undefined,
      baseSize: sell ? amt?.[1] : undefined,
    };
  }

  return { type: "help" };
}

/**
 * POST /api/agent
 * Natural-language → balances / price / trade (respects TRADE_DRY_RUN rails).
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const auth = authorized(request, body);
  if (auth.rejectedQuery) {
    return NextResponse.json(
      { error: "Query-string secrets are disabled; use x-trade-secret header" },
      { status: 401 },
    );
  }
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const message = String(body.message || body.prompt || "");
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const intent = parseIntent(message);

  try {
    if (intent.type === "help") {
      return NextResponse.json({
        reply:
          "Try: 'balances', 'price BTC', 'buy $2 of ETH', 'sell 0.001 BTC'. Live trades require TRADE_DRY_RUN=false.",
        intent,
      });
    }

    if (intent.type === "balance") {
      const accounts = await listAccounts();
      const slim = accounts
        .filter((a) => Number(a.available_balance?.value || 0) > 0)
        .map((a) => `${a.currency}: ${a.available_balance.value}`)
        .join(", ");
      return NextResponse.json({
        reply: slim ? `Balances — ${slim}` : "No non-zero balances.",
        intent,
        accounts: accounts
          .filter((a) => Number(a.available_balance?.value || 0) > 0)
          .map((a) => ({
            currency: a.currency,
            available: a.available_balance.value,
          })),
      });
    }

    if (intent.type === "price") {
      const data = await getBestBidAsk([intent.product]);
      return NextResponse.json({
        reply: `Price check for ${intent.product}`,
        intent,
        data,
      });
    }

    const result = await executeTradeSignal({
      ticker: intent.product,
      action: intent.action,
      quoteSize: intent.quoteSize,
      baseSize: intent.baseSize,
      source: "coinbase-agent",
      strategy: "nl-agent",
      dryRun: body.dryRun as boolean | undefined,
    });

    return NextResponse.json({
      reply: result.ok
        ? result.dryRun
          ? `Dry-run ${result.side} ${result.productId} (quote=${result.quoteSize ?? "-"} base=${result.baseSize ?? "-"})`
          : `Order ${result.side} ${result.productId}: ${result.order && "order_id" in result.order ? result.order.order_id : "submitted"}`
        : `Rejected: ${result.reason}`,
      intent,
      result,
    });
  } catch (err) {
    const messageErr = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: messageErr }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/agent",
    examples: [
      { message: "balances" },
      { message: "price BTC" },
      { message: "buy $2 of ETH" },
    ],
  });
}
