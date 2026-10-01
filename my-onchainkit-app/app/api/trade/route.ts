import { NextRequest, NextResponse } from "next/server";
import { extractSharedSecret, secretsMatch } from "@/lib/authSecret";
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

/**
 * POST /api/trade
 * Body: { productId|ticker, side|action, quoteSize?, baseSize? }
 * Auth: x-trade-secret header (query ?secret= blocked in production)
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

  try {
    const result = await executeTradeSignal({
      ticker: String(body.productId || body.ticker || body.symbol || ""),
      action: String(body.side || body.action || ""),
      quoteSize: body.quoteSize as string | number | undefined,
      baseSize: body.baseSize as string | number | undefined,
      orderType: typeof body.orderType === "string" ? body.orderType : undefined,
      limitPrice: body.limitPrice as string | number | undefined,
      postOnly:
        typeof body.postOnly === "boolean" ? body.postOnly : undefined,
      // dryRun from client is ignored unless TRADE_ALLOW_LIVE_OVERRIDE=true
      dryRun: body.dryRun as boolean | undefined,
      source: "trade-api",
      strategy: typeof body.strategy === "string" ? body.strategy : undefined,
      price: body.price as string | number | undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("trade API error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/trade",
    method: "POST",
    auth: "Header x-trade-secret (query ?secret= disabled in production)",
    dryRunDefault: process.env.TRADE_DRY_RUN !== "false",
    example: {
      ticker: "BTC-USD",
      action: "buy",
      quoteSize: "2",
    },
  });
}
