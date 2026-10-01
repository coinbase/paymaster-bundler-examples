/**
 * Algo alert helpers — Telegram + webhook + Instagram (Meta Messaging API).
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
 *   ALGO_ALERT_WEBHOOK_URL / ALGO_ALERT_SECRET
 *   INSTAGRAM_PAGE_ID
 *   INSTAGRAM_PAGE_ACCESS_TOKEN
 *   INSTAGRAM_RECIPIENT_IGSID   (your IGSID — captured after you DM the business account)
 */
const GRAPH = "https://graph.facebook.com/v21.0";

async function sendInstagram(text) {
  const pageId = process.env.INSTAGRAM_PAGE_ID;
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  const igsid = process.env.INSTAGRAM_RECIPIENT_IGSID;
  if (!pageId || !token || !igsid) {
    return { skipped: true, reason: "missing INSTAGRAM_PAGE_ID / TOKEN / RECIPIENT_IGSID" };
  }

  // Prefer RESPONSE; fall back to HUMAN_AGENT tag for longer window after you DM the page.
  const payloads = [
    {
      recipient: { id: igsid },
      messaging_type: "RESPONSE",
      message: { text: text.slice(0, 950) },
    },
    {
      recipient: { id: igsid },
      messaging_type: "MESSAGE_TAG",
      tag: "HUMAN_AGENT",
      message: { text: text.slice(0, 950) },
    },
  ];

  let last = null;
  for (const payload of payloads) {
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(pageId)}/messages?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = await res.text();
    last = { ok: res.ok, status: res.status, body: body.slice(0, 300), mode: payload.messaging_type };
    if (res.ok) return last;
  }
  return last;
}

export async function sendAlert(message, extra = {}) {
  const text = String(message).slice(0, 3500);
  const jobs = [];
  const results = { telegram: null, webhook: null, instagram: null };

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    jobs.push(
      (async () => {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: chat,
              text,
              disable_web_page_preview: true,
            }),
          },
        );
        const body = await res.text();
        results.telegram = { ok: res.ok, status: res.status, body: body.slice(0, 200) };
        if (!res.ok) console.error("telegram alert", res.status, body);
      })(),
    );
  }

  const hook = process.env.ALGO_ALERT_WEBHOOK_URL;
  if (hook) {
    jobs.push(
      (async () => {
        const headers = { "content-type": "application/json" };
        const secret = process.env.ALGO_ALERT_SECRET || process.env.TRADE_API_SECRET;
        if (secret) headers["x-algo-alert-secret"] = secret;
        const res = await fetch(hook, {
          method: "POST",
          headers,
          body: JSON.stringify({
            text,
            source: "algo",
            ts: new Date().toISOString(),
            ...extra,
          }),
        });
        const body = await res.text();
        results.webhook = { ok: res.ok, status: res.status, body: body.slice(0, 200) };
        if (!res.ok) console.error("webhook alert", res.status, body);
      })(),
    );
  }

  if (
    process.env.INSTAGRAM_PAGE_ACCESS_TOKEN &&
    process.env.INSTAGRAM_PAGE_ID &&
    process.env.INSTAGRAM_RECIPIENT_IGSID
  ) {
    jobs.push(
      (async () => {
        results.instagram = await sendInstagram(text);
        if (results.instagram && results.instagram.ok === false) {
          console.error("instagram alert", results.instagram);
        }
      })(),
    );
  }

  if (!jobs.length) return { skipped: true, results };
  await Promise.allSettled(jobs);
  return { ok: true, results };
}
