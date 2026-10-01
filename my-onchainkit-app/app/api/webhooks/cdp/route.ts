import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/verifyWebhookSignature";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.error("WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const signature = request.headers.get("x-hook0-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const payload = await request.text();

  if (
    !verifyWebhookSignature(payload, signature, secret, request.headers)
  ) {
    console.error("Webhook verification failed", {
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { id?: string; type?: string; data?: unknown };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("CDP webhook received", {
    id: event.id,
    type: event.type,
  });

  // Extend with your business logic (DB write, queue, alerts, etc.)
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/webhooks/cdp",
    method: "POST",
  });
}
