import { NextRequest, NextResponse } from "next/server";
import { extractSharedSecret, secretsMatch } from "@/lib/authSecret";
import { cancelOrders, getOrder } from "@/lib/coinbaseTrade";

export const runtime = "nodejs";

function authorized(request: NextRequest): {
  ok: boolean;
  rejectedQuery?: boolean;
} {
  const expected = process.env.TRADE_API_SECRET;
  if (!expected) return { ok: false };
  const { secret, rejectedQuery } = extractSharedSecret(request, {
    headerNames: ["x-trade-secret", "x-webhook-secret"],
  });
  if (rejectedQuery) return { ok: false, rejectedQuery: true };
  if (!secret || !secretsMatch(secret, expected)) return { ok: false };
  return { ok: true };
}

/** GET /api/trade/order?id=... — order status / fills */
export async function GET(request: NextRequest) {
  const auth = authorized(request);
  if (auth.rejectedQuery) {
    return NextResponse.json(
      { error: "Query-string secrets are disabled; use x-trade-secret header" },
      { status: 401 },
    );
  }
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  try {
    const order = await getOrder(id);
    return NextResponse.json({ order });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/trade/order { action: "cancel", orderId } */
export async function POST(request: NextRequest) {
  const auth = authorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      action?: string;
      orderId?: string;
      orderIds?: string[];
    };
    if (body.action !== "cancel") {
      return NextResponse.json({ error: "unsupported action" }, { status: 400 });
    }
    const ids = body.orderIds || (body.orderId ? [body.orderId] : []);
    if (!ids.length) {
      return NextResponse.json({ error: "missing orderId" }, { status: 400 });
    }
    const result = await cancelOrders(ids);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
