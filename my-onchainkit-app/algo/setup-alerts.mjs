/**
 * Interactive-ish alert setup + smoke test.
 *
 *   node algo/setup-alerts.mjs
 *   node algo/setup-alerts.mjs --chat-from-updates
 *   node algo/setup-alerts.mjs --test
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { sendAlert } from "./lib/alerts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
loadEnv({ path: join(root, ".env.local") });
loadEnv({ path: join(root, ".env") });

const args = new Set(process.argv.slice(2));

function printHelp() {
  console.log(`
Algo alerts setup
=================
1) Telegram
   - Open Telegram → @BotFather → /newbot → copy the token
   - Put TELEGRAM_BOT_TOKEN=... in .env.local
   - Message your new bot (press Start)
   - Run: node algo/setup-alerts.mjs --chat-from-updates
   - Put TELEGRAM_CHAT_ID=... in .env.local

2) Webhook (already wired if ALGO_ALERT_WEBHOOK_URL is set)
   - POST https://my-onchainkit-app.vercel.app/api/webhooks/algo
   - Header: x-algo-alert-secret: <ALGO_ALERT_SECRET>

3) Test both:
   node algo/setup-alerts.mjs --test
`);
}

async function chatFromUpdates() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("Set TELEGRAM_BOT_TOKEN in .env.local first");
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const data = await res.json();
  if (!data.ok) {
    console.error("getUpdates failed:", data);
    process.exit(1);
  }
  const chats = new Map();
  for (const u of data.result || []) {
    const c = u.message?.chat || u.my_chat_member?.chat;
    if (c?.id != null) {
      chats.set(String(c.id), c.username || c.title || c.first_name || c.id);
    }
  }
  if (!chats.size) {
    console.log(
      "No chats yet. Open Telegram, find your bot, press Start / send any message, then re-run.",
    );
    process.exit(2);
  }
  console.log("Found chat(s):");
  for (const [id, name] of chats) {
    console.log(`  TELEGRAM_CHAT_ID=${id}  (${name})`);
  }
}

async function test() {
  console.log("TELEGRAM_BOT_TOKEN:", process.env.TELEGRAM_BOT_TOKEN ? "set" : "MISSING");
  console.log("TELEGRAM_CHAT_ID:", process.env.TELEGRAM_CHAT_ID || "MISSING");
  console.log("ALGO_ALERT_WEBHOOK_URL:", process.env.ALGO_ALERT_WEBHOOK_URL || "MISSING");
  console.log("ALGO_ALERT_SECRET:", process.env.ALGO_ALERT_SECRET ? "set" : "MISSING");

  const result = await sendAlert(
    `🔔 Algo alert test ${new Date().toISOString()} — ETH-EUR bot online`,
    { product: "ETH-EUR", side: "test" },
  );
  console.log("sendAlert →", JSON.stringify(result, null, 2));
}

if (args.has("--help") || args.size === 0) printHelp();
if (args.has("--chat-from-updates")) await chatFromUpdates();
if (args.has("--test")) await test();
