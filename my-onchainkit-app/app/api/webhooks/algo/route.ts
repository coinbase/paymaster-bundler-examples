import { NextRequest, NextResponse } from "next/server";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { extractSharedSecret, secretsMatch } from "@/lib/authSecret";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/algo
 * Receives algo trade alerts. Auth: x-algo-alert-secret or body.secret
 * Optional: forwards to Telegram when TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set on the server.
 */
export async function POST(request: NextRequest) {
  const expected =
    process.env.ALGO_ALERT_SECRET || process.env.TRADE_API_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "ALGO_ALERT_SECRET not configured" },
      { status: 500 },
    );
  }

  const raw = await request.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    body = { text: raw };
  }

  const { secret, rejectedQuery } = extractSharedSecret(request, {
    body,
    raw,
    headerNames: ["x-algo-alert-secret", "x-webhook-secret", "x-trade-secret"],
  });

  if (rejectedQuery) {
    return NextResponse.json(
      { error: "Query-string secrets disabled; use header x-algo-alert-secret" },
      { status: 401 },
    );
  }
  if (!secret || !secretsMatch(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const text = String(body.text || body.message || "").slice(0, 3500);
  const event = {
    receivedAt: new Date().toISOString(),
    text,
    product: body.product,
    side: body.side,
    source: body.source || "algo",
    extra: body,
  };

  console.log("Algo alert", {
    text: text.slice(0, 120),
    product: body.product,
    side: body.side,
  });

  // Persist on serverless best-effort (may be ephemeral on Vercel)
  try {
    const dir = join(process.cwd(), "algo");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, "alerts.webhook.jsonl"),
      `${JSON.stringify(event)}\n`,
      "utf8",
    );
  } catch {
    /* ignore fs on read-only runtime */
  }

  let telegram: { ok: boolean; error?: string } | null = null;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat && text) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chat,
            text: text.slice(0, 3500),
            disable_web_page_preview: true,
          }),
        },
      );
      if (!res.ok) {
        telegram = { ok: false, error: await res.text() };
      } else {
        telegram = { ok: true };
      }
    } catch (err) {
      telegram = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json({
    ok: true,
    received: true,
    telegram,
  });
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/webhooks/algo",
    method: "POST",
    auth: "Header x-algo-alert-secret",
    telegramConfigured: Boolean(
      process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID,
    ),
  });
}
