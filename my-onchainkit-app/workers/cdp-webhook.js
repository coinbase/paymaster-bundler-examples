/**
 * Standalone Cloudflare Worker alternative for CDP webhooks.
 * Deploy with: npx wrangler deploy
 * Set secret: npx wrangler secret put WEBHOOK_SECRET
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/webhooks/cdp") {
      return new Response(JSON.stringify({ status: "ok", endpoint: "/api/webhooks/cdp" }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok", method: "POST" }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const secret = env.WEBHOOK_SECRET;
    if (!secret) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const signature = request.headers.get("x-hook0-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const payload = await request.text();
    if (!(await verifyWebhookSignature(payload, signature, secret, request.headers))) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    try {
      const event = JSON.parse(payload);
      console.log("CDP webhook received", { id: event.id, type: event.type });
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
};

async function verifyWebhookSignature(payload, signatureHeader, secret, headers, maxAgeMinutes = 5) {
  try {
    const elements = signatureHeader.split(",");
    const timestamp = elements.find((e) => e.startsWith("t="))?.slice(2);
    const headerNames = elements.find((e) => e.startsWith("h="))?.slice(2);
    const v1 = elements.find((e) => e.startsWith("v1="))?.slice(3);
    const v0 = elements.find((e) => e.startsWith("v0="))?.slice(3);
    if (!timestamp) return false;

    const ageMinutes = (Date.now() - Number.parseInt(timestamp, 10) * 1000) / (1000 * 60);
    if (Number.isNaN(ageMinutes) || ageMinutes > maxAgeMinutes) return false;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const candidates = [];
    if (v1 && headerNames) {
      const headerValues = headerNames
        .split(" ")
        .map((name) => headers.get(name) ?? "")
        .join(".");
      candidates.push({
        provided: v1,
        signed: `${timestamp}.${headerNames}.${headerValues}.${payload}`,
      });
    }
    if (v0) {
      candidates.push({ provided: v0, signed: `${timestamp}.${payload}` });
    }

    for (const candidate of candidates) {
      if (!candidate.provided) continue;
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(candidate.signed));
      const expected = [...new Uint8Array(sig)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (timingSafeEqualHex(expected, candidate.provided)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
