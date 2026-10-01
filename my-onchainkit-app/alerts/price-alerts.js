/**
 * Free alt #2 — Self-hosted price / RSI alerts (mkt-alerts style).
 * Polls Coinbase Advanced Trade candles + ticker; POSTs to your webhook.
 *
 * Usage:
 *   cp alerts.config.example.json alerts.config.json
 *   npm run price
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { postAlert } from "./lib/postAlert.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, ".env") });
loadEnv({ path: join(__dirname, "../.env.local") });

const REST = "https://api.coinbase.com/api/v3/brokerage";
const POLL_MS = Number(process.env.ALERT_POLL_MS || 60_000);

const configPath = join(__dirname, "alerts.config.json");
if (!existsSync(configPath)) {
  console.error("Missing alerts.config.json — copy alerts.config.example.json");
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));
const rules = config.rules || [];

/** @type {Map<string, number>} */
const lastFired = new Map();

function cooldownOk(id, sec = 3600) {
  const prev = lastFired.get(id) ?? 0;
  if (Date.now() - prev < sec * 1000) return false;
  lastFired.set(id, Date.now());
  return true;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function getTicker(product) {
  const res = await fetch(`${REST}/market/products/${product}/ticker`);
  if (!res.ok) throw new Error(`ticker ${product}: ${res.status}`);
  const data = await res.json();
  const price = Number(
    data.price ?? data.trades?.[0]?.price ?? data.best_bid ?? data.best_ask,
  );
  if (!Number.isFinite(price)) {
    throw new Error(`no price in ticker for ${product}`);
  }
  return price;
}

async function getCloses(product, granularity = "ONE_HOUR", limit = 50) {
  const end = new Date();
  const start = new Date(end.getTime() - 50 * 60 * 60 * 1000);
  const url = new URL(`${REST}/market/products/${product}/candles`);
  url.searchParams.set("start", Math.floor(start.getTime() / 1000).toString());
  url.searchParams.set("end", Math.floor(end.getTime() / 1000).toString());
  url.searchParams.set("granularity", granularity);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url);
  if (!res.ok) throw new Error(`candles ${product}: ${res.status}`);
  const data = await res.json();
  // candles: [start, low, high, open, close, volume] newest first typically
  const candles = data.candles || [];
  const closes = candles
    .map((c) => Number(c.close ?? c[4]))
    .filter(Number.isFinite)
    .reverse();
  return closes;
}

async function checkRule(rule) {
  const product = rule.product;
  let price = null;
  let value = null;

  if (rule.rsiBelow != null || rule.rsiAbove != null) {
    const closes = await getCloses(
      product,
      rule.candleGranularity || "ONE_HOUR",
    );
    value = rsi(closes, rule.rsiPeriod || 14);
    if (value == null) return;
    price = closes[closes.length - 1];

    const hit =
      (rule.rsiBelow != null && value <= rule.rsiBelow) ||
      (rule.rsiAbove != null && value >= rule.rsiAbove);
    if (!hit) return;
  } else {
    price = await getTicker(product);
    if (!Number.isFinite(price)) return;
    const hit =
      (rule.above != null && price >= rule.above) ||
      (rule.below != null && price <= rule.below);
    if (!hit) return;
  }

  if (!cooldownOk(rule.id, rule.cooldownSec ?? 3600)) return;

  console.log(
    `⚡ ${rule.id}: ${product} price=${price}` +
      (value != null ? ` rsi=${value.toFixed(2)}` : ""),
  );

  await postAlert({
    source: "price-alerts",
    ticker: product,
    action: rule.action ?? "alert",
    price: String(price),
    rsi: value != null ? Number(value.toFixed(2)) : undefined,
    rule: rule.id,
    strategy: "mkt-alerts-style",
  });
}

async function tick() {
  console.log(`poll @ ${new Date().toISOString()}`);
  for (const rule of rules) {
    try {
      await checkRule(rule);
    } catch (err) {
      console.error(rule.id, err.message);
    }
  }
}

console.log(`Price/RSI alerts — ${rules.length} rules, every ${POLL_MS}ms`);
await tick();
setInterval(tick, POLL_MS);
