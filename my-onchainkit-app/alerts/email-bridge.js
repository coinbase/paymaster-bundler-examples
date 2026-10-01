/**
 * Free alt #1 — TradingView free-plan email → webhook bridge.
 * Free TV alerts can email you; this watches IMAP and forwards to your webhook.
 *
 * Setup (Gmail recommended):
 *   1. Google Account → Security → 2-Step Verification → App passwords
 *   2. Create app password for "Mail"
 *   3. In TradingView alert: enable Email (plain text), use message JSON:
 *      {"ticker":"{{ticker}}","action":"buy","price":"{{close}}","secret":"<optional>"}
 *   4. Copy alerts/.env.example → alerts/.env and fill IMAP_* vars
 *   5. npm run email
 */
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { postAlert } from "./lib/postAlert.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, ".env") });
loadEnv({ path: join(__dirname, "../.env.local") });

const host = process.env.IMAP_HOST || "imap.gmail.com";
const port = Number(process.env.IMAP_PORT || 993);
const user = process.env.IMAP_USER;
const pass = process.env.IMAP_PASS;
const mailbox = process.env.IMAP_MAILBOX || "INBOX";
const fromFilter = (process.env.TV_EMAIL_FROM || "tradingview.com").toLowerCase();
const pollMs = Number(process.env.EMAIL_POLL_MS || 30_000);

if (!user || !pass) {
  console.error("Set IMAP_USER and IMAP_PASS (Gmail app password) in alerts/.env");
  process.exit(1);
}

/** @type {Set<string>} */
const seen = new Set();

function extractJson(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function parseAlert(subject, text, html) {
  const body = text || (html || "").replace(/<[^>]+>/g, " ");
  const json = extractJson(body);

  // Allowlist only — never spread attacker-controlled JSON wholesale
  const actionRaw = String(
    json?.action || json?.side || "",
  ).toLowerCase();
  let action = "alert";
  if (["buy", "long", "sell", "short"].includes(actionRaw)) {
    action = actionRaw === "long" ? "buy" : actionRaw === "short" ? "sell" : actionRaw;
  } else if (/sell|short/i.test(subject + body)) {
    action = "sell";
  } else if (/buy|long/i.test(subject + body)) {
    action = "buy";
  }

  const ticker =
    (typeof json?.ticker === "string" && json.ticker) ||
    (typeof json?.symbol === "string" && json.symbol) ||
    subject.match(/\b([A-Z0-9]{2,15}(?:USD[CT]?|USDT)?)\b/i)?.[1] ||
    body.match(/\b([A-Z0-9]{2,15}-(?:USD[CT]?|USDT))\b/i)?.[1] ||
    "UNKNOWN";

  return {
    ticker: String(ticker).slice(0, 32),
    action,
    price: json?.price != null ? String(json.price).slice(0, 32) : undefined,
    interval:
      typeof json?.interval === "string"
        ? json.interval.slice(0, 16)
        : undefined,
    strategy: "tradingview-email",
    // Intentionally omit quoteSize / baseSize from email path
  };
}

function dkimLooksValid(parsed) {
  // Prefer Authentication-Results when present (Gmail adds these)
  const headers = parsed.headers;
  if (!headers || typeof headers.get !== "function") return null;
  const auth =
    String(headers.get("authentication-results") || "").toLowerCase() +
    " " +
    String(headers.get("arc-authentication-results") || "").toLowerCase();
  if (!auth.trim()) return null;
  if (auth.includes("dkim=pass")) return true;
  if (auth.includes("dkim=fail") || auth.includes("dkim=neutral")) return false;
  return null;
}

async function processMessage(client, msg) {
  const uid = String(msg.uid);
  if (seen.has(uid)) return;
  seen.add(uid);

  const source = await client.download(msg.uid);
  const parsed = await simpleParser(source);
  const from = (parsed.from?.text || "").toLowerCase();
  if (!from.includes(fromFilter)) return;

  const requireDkim =
    String(process.env.REQUIRE_TV_DKIM || "true").toLowerCase() !== "false";
  const dkim = dkimLooksValid(parsed);
  if (requireDkim && dkim === false) {
    console.warn(`skip uid=${uid}: DKIM fail`);
    return;
  }
  if (requireDkim && dkim === null) {
    console.warn(
      `skip uid=${uid}: no Authentication-Results/DKIM (set REQUIRE_TV_DKIM=false to allow)`,
    );
    return;
  }

  const subject = parsed.subject || "";
  const alert = parseAlert(subject, parsed.text, parsed.html);

  console.log(`✉ TV email: ${subject}`);
  await postAlert({
    source: "tv-email-bridge",
    ...alert,
  });

  await client.messageFlagsAdd(msg.uid, ["\\Seen"]);
}

async function pollOnce(client) {
  const lock = await client.getMailboxLock(mailbox);
  try {
    // Unseen from last 2 days
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    for await (const msg of client.fetch(
      { seen: false, since },
      { uid: true, envelope: true },
    )) {
      const from = (msg.envelope?.from || [])
        .map((a) => `${a.address || ""} ${a.name || ""}`)
        .join(" ")
        .toLowerCase();
      if (!from.includes(fromFilter)) continue;
      try {
        await processMessage(client, msg);
      } catch (err) {
        console.error("message failed", err.message);
      }
    }
  } finally {
    lock.release();
  }
}

async function main() {
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  client.on("error", (err) => console.error("IMAP error", err.message));

  await client.connect();
  console.log(`IMAP connected as ${user} — watching for ${fromFilter}`);

  await pollOnce(client);
  setInterval(() => {
    pollOnce(client).catch((err) => console.error("poll", err.message));
  }, pollMs);

  // IDLE when supported
  try {
    await client.idle();
  } catch {
    // periodic poll is enough
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
