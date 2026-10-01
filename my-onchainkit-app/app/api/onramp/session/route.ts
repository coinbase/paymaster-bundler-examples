import { NextRequest, NextResponse } from "next/server";
import {
  buildOfframpSellUrl,
  buildOnrampBuyUrl,
  clientIpFromRequest,
  createOnrampSessionToken,
} from "@/lib/onrampSession";

export const runtime = "nodejs";

/**
 * POST /api/onramp/session
 * Body: { address, mode?: "buy"|"sell", blockchains?, assets?, presetFiatAmount?, ... }
 * Returns { sessionToken, url } for Coinbase-hosted Onramp or Offramp.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = String(body.address || "");
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const mode = String(body.mode || "buy").toLowerCase() === "sell" ? "sell" : "buy";
  const blockchains = Array.isArray(body.blockchains)
    ? (body.blockchains as string[])
    : undefined;
  const assets = Array.isArray(body.assets) ? (body.assets as string[]) : undefined;

  const origin =
    (typeof body.redirectUrl === "string" && body.redirectUrl) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    request.headers.get("origin") ||
    "http://localhost:3000";

  const partnerUserRef =
    (typeof body.partnerUserRef === "string" && body.partnerUserRef) ||
    `user-${address.slice(2, 10).toLowerCase()}`;

  try {
    const { token, channel_id } = await createOnrampSessionToken({
      address,
      blockchains,
      assets,
      clientIp: clientIpFromRequest(request.headers),
    });

    const presetFiatAmount =
      body.presetFiatAmount != null ? Number(body.presetFiatAmount) : undefined;
    const fiatCurrency =
      typeof body.fiatCurrency === "string" ? body.fiatCurrency : "USD";
    const defaultAsset =
      typeof body.defaultAsset === "string" ? body.defaultAsset : "ETH";
    const defaultNetwork =
      typeof body.defaultNetwork === "string" ? body.defaultNetwork : "base";

    const url =
      mode === "sell"
        ? buildOfframpSellUrl({
            sessionToken: token,
            partnerUserRef,
            redirectUrl: origin,
            presetFiatAmount: Number.isFinite(presetFiatAmount)
              ? presetFiatAmount
              : undefined,
            fiatCurrency,
            defaultAsset,
            defaultNetwork,
          })
        : buildOnrampBuyUrl({
            sessionToken: token,
            redirectUrl: origin,
            partnerUserRef,
            presetFiatAmount: Number.isFinite(presetFiatAmount)
              ? presetFiatAmount
              : undefined,
            fiatCurrency,
            defaultAsset,
            defaultNetwork,
          });

    return NextResponse.json({
      sessionToken: token,
      channel_id,
      mode,
      url,
      expiresInSec: 300,
      note:
        mode === "sell"
          ? "Add your production domain to CDP Onramp redirect allowlist"
          : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("onramp session error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/onramp/session",
    method: "POST",
    example: {
      address: "0xYourWallet",
      mode: "buy",
      blockchains: ["base", "ethereum"],
      defaultAsset: "ETH",
      presetFiatAmount: 20,
    },
  });
}
