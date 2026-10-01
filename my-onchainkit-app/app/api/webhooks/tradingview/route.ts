import { NextRequest, NextResponse } from "next/server";
import { extractSharedSecret, secretsMatch } from "@/lib/authSecret";
import { alertDedupeKey, isReplay } from "@/lib/webhookDedup";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expected = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expected) {
    console.error("TRADINGVIEW_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const raw = await request.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    body = null;
  }

  const { secret, rejectedQuery } = extractSharedSecret(request, {
    body,
    raw,
    headerNames: ["x-tradingview-secret", "x-webhook-secret"],
  });

  if (rejectedQuery) {
    return NextResponse.json(
      {
        error:
          "Query-string secrets are disabled; use x-tradingview-secret header or JSON body.secret",
      },
      { status: 401 },
    );
  }

  if (!secret || !secretsMatch(secret, expected)) {
    console.error("TradingView webhook auth failed", {
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dedupeKey = alertDedupeKey({
    ticker: body?.ticker ?? body?.symbol,
    action: body?.action ?? body?.side,
    price: body?.price,
    time: body?.time ?? body?.timenow,
    interval: body?.interval,
    strategy: body?.strategy,
    raw: body ? undefined : raw,
  });

  if (isReplay(dedupeKey)) {
    console.warn("TradingView webhook replay rejected", { dedupeKey: dedupeKey.slice(0, 12) });
    return NextResponse.json(
      { ok: true, duplicate: true, message: "replay ignored" },
      { status: 200 },
    );
  }

  const signal = {
    receivedAt: new Date().toISOString(),
    contentType: request.headers.get("content-type"),
    ...(body ?? { text: raw }),
  };

  console.log("TradingView alert received", {
    ticker: body?.ticker ?? body?.symbol,
    action: body?.action ?? body?.side,
    strategy: body?.strategy,
  });

  let trade = null;
  const autoTrade =
    String(process.env.AUTO_TRADE || "false").toLowerCase() === "true";
  if (autoTrade && body) {
    // Email-sourced alerts must not carry arbitrary sizes unless explicitly allowed
    const source = String(body.source ?? "tradingview-webhook");
    const fromEmail = source === "tv-email-bridge";
    const allowEmailSizes =
      String(process.env.ALLOW_EMAIL_TRADE_SIZES || "").toLowerCase() ===
      "true";

    try {
      const { executeTradeSignal } = await import("@/lib/tradeAgent");
      trade = await executeTradeSignal({
        ticker: String(body.ticker ?? body.symbol ?? ""),
        action: String(body.action ?? body.side ?? ""),
        quoteSize:
          fromEmail && !allowEmailSizes
            ? undefined
            : (body.quoteSize as string | number | undefined),
        baseSize:
          fromEmail && !allowEmailSizes
            ? undefined
            : (body.baseSize as string | number | undefined),
        price: body.price as string | number | undefined,
        source,
        strategy: typeof body.strategy === "string" ? body.strategy : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("auto-trade failed", message);
      trade = { ok: false, reason: message };
    }
  }

  return NextResponse.json({ ok: true, signal, trade }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/webhooks/tradingview",
    method: "POST",
    auth: "Header x-tradingview-secret or JSON body.secret (query disabled in production)",
    messageFormat: {
      secret: "<TRADINGVIEW_WEBHOOK_SECRET>",
      ticker: "{{ticker}}",
      action: "buy",
      price: "{{close}}",
      interval: "{{interval}}",
      time: "{{timenow}}",
    },
  });
}
