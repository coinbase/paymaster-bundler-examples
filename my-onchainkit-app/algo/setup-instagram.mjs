/**
 * Instagram trade-alert setup helper.
 *
 * Instagram cannot use a simple bot token like Telegram. You need:
 *  1) Instagram Professional account linked to a Facebook Page
 *  2) Meta Developer app with Instagram Messaging
 *  3) Page access token + Page ID
 *  4) You DM that Instagram business account once (captures IGSID)
 *
 *   node algo/setup-instagram.mjs
 *   node algo/setup-instagram.mjs --test
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { sendAlert } from "./lib/alerts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
loadEnv({ path: join(root, ".env.local") });
loadEnv({ path: join(root, ".env") });

const args = new Set(process.argv.slice(2));

function help() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://my-onchainkit-app.vercel.app";
  console.log(`
Instagram trade notifications (Meta Messaging API)
==================================================
Personal Instagram accounts cannot receive automated DMs via API.
Convert your IG to Professional + link a Facebook Page, then:

1) Meta Developers → create app → add Messenger → Instagram
   https://developers.facebook.com/apps/

2) Generate a Page access token with instagram_manage_messages
   (Messenger → Instagram Settings → generate token)

3) Put in .env.local / Vercel:
   INSTAGRAM_PAGE_ID=...
   INSTAGRAM_PAGE_ACCESS_TOKEN=...
   INSTAGRAM_VERIFY_TOKEN=${process.env.INSTAGRAM_VERIFY_TOKEN || process.env.ALGO_ALERT_SECRET || "(same as ALGO_ALERT_SECRET)"}
   INSTAGRAM_RECIPIENT_IGSID=   (filled after step 5)

4) Meta webhook callback URL:
   ${appUrl}/api/webhooks/instagram
   Verify token: INSTAGRAM_VERIFY_TOKEN
   Subscribe: messages

5) From your personal IG, send any DM to the Professional/business account
   → webhook saves IGSID → copy into INSTAGRAM_RECIPIENT_IGSID

6) Test:
   node algo/setup-instagram.mjs --test

Limits: Meta only allows automated replies in a short window after you DM
the business account (use HUMAN_AGENT tag; re-DM if alerts stop).
Telegram remains the reliable channel for every trade.
`);
}

async function test() {
  const store = join(__dirname, "instagram.recipient.json");
  if (!process.env.INSTAGRAM_RECIPIENT_IGSID && existsSync(store)) {
    try {
      const j = JSON.parse(readFileSync(store, "utf8"));
      if (j.igsid) {
        process.env.INSTAGRAM_RECIPIENT_IGSID = j.igsid;
        console.log("Loaded IGSID from algo/instagram.recipient.json:", j.igsid);
      }
    } catch {
      /* ignore */
    }
  }

  console.log("INSTAGRAM_PAGE_ID:", process.env.INSTAGRAM_PAGE_ID ? "set" : "MISSING");
  console.log(
    "INSTAGRAM_PAGE_ACCESS_TOKEN:",
    process.env.INSTAGRAM_PAGE_ACCESS_TOKEN ? "set" : "MISSING",
  );
  console.log(
    "INSTAGRAM_RECIPIENT_IGSID:",
    process.env.INSTAGRAM_RECIPIENT_IGSID || "MISSING",
  );

  const result = await sendAlert(
    `📸 Instagram trade alert test ${new Date().toISOString()}`,
    { product: "TEST", side: "test" },
  );
  console.log(JSON.stringify(result, null, 2));
}

if (args.has("--test")) await test();
else help();
