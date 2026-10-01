/**
 * POST a signal to the TradingView-compatible webhook.
 * Requires ALERT_WEBHOOK_URL (no hardcoded production default).
 */
export async function postAlert(payload) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    throw new Error(
      "ALERT_WEBHOOK_URL is required (set in alerts/.env — do not rely on a hardcoded host)",
    );
  }
  const secret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("TRADINGVIEW_WEBHOOK_SECRET is required");
  }

  const body = {
    secret,
    source: payload.source ?? "free-alert",
    time: new Date().toISOString(),
    ...payload,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tradingview-secret": secret,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Webhook ${res.status}: ${text}`);
  }

  console.log("→ webhook ok", {
    ticker: body.ticker,
    action: body.action,
    source: body.source,
  });
  return text;
}
