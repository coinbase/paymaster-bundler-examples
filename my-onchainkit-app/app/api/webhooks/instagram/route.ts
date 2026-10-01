import { NextRequest, NextResponse } from "next/server";
import { appendFileSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

const STORE = join(process.cwd(), "algo", "instagram.recipient.json");

function saveRecipient(igsid: string, raw: unknown) {
  try {
    const dir = join(process.cwd(), "algo");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      STORE,
      JSON.stringify(
        { igsid, updatedAt: new Date().toISOString(), sample: raw },
        null,
        2,
      ),
    );
    appendFileSync(
      join(dir, "instagram.webhook.jsonl"),
      `${JSON.stringify({ ts: new Date().toISOString(), igsid, raw })}\n`,
    );
  } catch {
    /* ephemeral FS on some hosts */
  }
}

/**
 * Meta Instagram Messaging webhooks.
 * GET = verification challenge
 * POST = inbound messages (captures your IGSID for trade DMs)
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.INSTAGRAM_VERIFY_TOKEN || process.env.ALGO_ALERT_SECRET;

  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json(
    {
      status: "ok",
      endpoint: "/api/webhooks/instagram",
      hint: "Configure Meta webhook to this URL; set INSTAGRAM_VERIFY_TOKEN",
      recipientFile: existsSync(STORE)
        ? JSON.parse(readFileSync(STORE, "utf8"))
        : null,
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null);
  try {
    const entries = (raw as { entry?: unknown[] })?.entry || [];
    for (const entry of entries as Array<{ messaging?: unknown[] }>) {
      const messaging = entry.messaging || [];
      for (const ev of messaging as Array<{
        sender?: { id?: string };
        message?: { text?: string };
      }>) {
        const igsid = ev.sender?.id;
        if (igsid) {
          console.log("Instagram inbound from IGSID", igsid, ev.message?.text);
          saveRecipient(igsid, ev);
        }
      }
    }
  } catch (err) {
    console.error("instagram webhook parse", err);
  }
  // Always 200 so Meta does not disable the subscription
  return NextResponse.json({ ok: true });
}
