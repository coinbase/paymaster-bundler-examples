/**
 * Free alt #3 — Coinbase Advanced Trade WebSocket ticker watcher.
 * Fires your webhook when a price rule (above/below) is crossed.
 *
 * Usage:
 *   cp alerts.config.example.json alerts.config.json
 *   # set TRADINGVIEW_WEBHOOK_SECRET in ../.env.local or alerts/.env
 *   npm run ws
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import WebSocket from "ws";
import { postAlert } from "./lib/postAlert.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, ".env") });
loadEnv({ path: join(__dirname, "../.env.local") });

const WS_URL = "wss://advanced-trade-ws.coinbase.com";
const configPath = join(__dirname, "alerts.config.json");
if (!existsSync(configPath)) {
  console.error("Missing alerts.config.json — copy alerts.config.example.json");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const priceRules = (config.rules || []).filter(
  (r) => r.above != null || r.below != null,
);
const products = [
  ...new Set([
    ...(config.products || []),
    ...priceRules.map((r) => r.product),
  ]),
];

if (!products.length || !priceRules.length) {
  console.error("Need at least one product and one above/below rule");
  process.exit(1);
}

/** @type {Map<string, number>} */
const lastFired = new Map();
/** @type {Map<string, number>} last side of threshold: 1=above, -1=below, 0=mid */
const lastSide = new Map();

function cooldownOk(id, sec = 3600) {
  const prev = lastFired.get(id) ?? 0;
  if (Date.now() - prev < sec * 1000) return false;
  lastFired.set(id, Date.now());
  return true;
}

async function evaluate(product, price) {
  for (const rule of priceRules) {
    if (rule.product !== product) continue;

    let crossed = false;
    let side = 0;
    if (rule.above != null && price >= rule.above) {
      side = 1;
      const prev = lastSide.get(rule.id) ?? 0;
      if (prev !== 1) crossed = true;
    } else if (rule.below != null && price <= rule.below) {
      side = -1;
      const prev = lastSide.get(rule.id) ?? 0;
      if (prev !== -1) crossed = true;
    } else {
      side = 0;
    }
    lastSide.set(rule.id, side);

    if (!crossed) continue;
    if (!cooldownOk(rule.id, rule.cooldownSec ?? 3600)) continue;

    console.log(`⚡ ${rule.id}: ${product} @ ${price}`);
    try {
      await postAlert({
        source: "coinbase-ws",
        ticker: product,
        action: rule.action ?? "alert",
        price: String(price),
        rule: rule.id,
        strategy: "coinbase-ws",
      });
    } catch (err) {
      console.error("post failed", err.message);
    }
  }
}

function connect() {
  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log(`Coinbase WS connected — watching ${products.join(", ")}`);
    ws.send(
      JSON.stringify({
        type: "subscribe",
        product_ids: products,
        channel: "ticker",
      }),
    );
    ws.send(
      JSON.stringify({
        type: "subscribe",
        product_ids: products,
        channel: "heartbeats",
      }),
    );
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.channel !== "ticker" || !msg.events) return;

    for (const event of msg.events) {
      const tickers = event.tickers || [];
      for (const t of tickers) {
        const product = t.product_id;
        const price = Number(t.price ?? t.last_trade_price);
        if (!product || !Number.isFinite(price)) continue;
        evaluate(product, price);
      }
    }
  });

  ws.on("close", () => {
    console.warn("WS closed — reconnecting in 3s");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.error("WS error", err.message);
    ws.close();
  });
}

connect();
