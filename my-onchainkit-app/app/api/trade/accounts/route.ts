import { NextRequest, NextResponse } from "next/server";
import { extractSharedSecret, secretsMatch } from "@/lib/authSecret";
import { listAccounts } from "@/lib/coinbaseTrade";

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

/** GET /api/trade/accounts — balances for the CDP Advanced Trade key */
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
  try {
    const accounts = await listAccounts();
    const slim = accounts
      .filter((a) => Number(a.available_balance?.value || 0) > 0)
      .map((a) => ({
        currency: a.currency,
        available: a.available_balance?.value,
        hold: a.hold?.value ?? "0",
        name: a.name,
      }));
    return NextResponse.json({ accounts: slim });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
