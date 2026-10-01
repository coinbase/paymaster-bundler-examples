/**
 * Crypto trading algorithm runner — small-profit ETH takeout.
 *
 * Features:
 *  - Cash-only buys (EUR), sell tracked lots only
 *  - Fill tracking + cancel stale limits
 *  - Trailing TP + partial scale-out
 *  - Spread gate, UTC time filter
 *  - Daily loss / trade caps
 *  - Alerts + JSONL journal
 *
 *   npm run algo
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { getCandles, getTickerPrice } from "./lib/market.mjs";
import { fetchBalances, getOrder, cancelOrder, getSpreadPct } from "./lib/cdp.mjs";
import { sendAlert } from "./lib/alerts.mjs";
import { appendJournal } from "./lib/journal.mjs";
import { runStrategy } from "./strategies/index.mjs";
import { runCalibration } from "./calibrate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
loadEnv({ path: join(root, ".env.local") });
loadEnv({ path: join(root, ".env") });

const configPath = join(__dirname, "algo.config.json");
if (!existsSync(configPath)) {
  console.error("Missing algo/algo.config.json — copy algo.config.example.json");
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const statePath = join(__dirname, ".algo-state.json");
const journalPath = join(__dirname, "trades.journal.jsonl");
const calibPath = join(__dirname, "signals.calibrated.json");
const tradeUrl =
  process.env.ALGO_TRADE_URL ||
  `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/trade`;
const tradeSecret = process.env.TRADE_API_SECRET;

const CASH = new Set(["EUR", "USD", "USDC", "USDT", "GBP"]);

/** @type {any} */
let calibration = null;

function loadCalibrationFile() {
  if (!existsSync(calibPath)) return null;
  try {
    return JSON.parse(readFileSync(calibPath, "utf8"));
  } catch {
    return null;
  }
}

function productCfg(product) {
  const base = { ...cfg };
  if (!cfg.useCalibration || !calibration?.byProduct?.[product]) return base;
  const p = calibration.byProduct[product];
  return {
    ...base,
    rsiBuyBelow: p.rsiBuyBelow ?? base.rsiBuyBelow,
    takeProfitPct: p.takeProfitPct ?? base.takeProfitPct,
    takeProfitPctMin: p.takeProfitPctMin ?? base.takeProfitPctMin,
    takeProfitPctMax: p.takeProfitPctMax ?? base.takeProfitPctMax,
    stopLossPct: p.stopLossPct ?? base.stopLossPct,
    trailArmPct: p.trailArmPct ?? base.trailArmPct,
    trailPct: p.trailPct ?? base.trailPct,
    scaleOutPct: p.scaleOutPct ?? base.scaleOutPct,
  };
}

async function ensureCalibration(reason = "schedule") {
  if (cfg.useCalibration === false) return;
  const before = calibration?.calibratedAt;
  calibration = await runCalibration({ silent: reason !== "startup" });
  if (!calibration) calibration = loadCalibrationFile();
  if (calibration?.calibratedAt && calibration.calibratedAt !== before) {
    const summary = Object.entries(calibration.byProduct || {})
      .map(
        ([p, v]) =>
          `${p}: RSI≤${v.rsiBuyBelow} TP${v.takeProfitPct}/SL${v.stopLossPct}`,
      )
      .join(" | ");
    console.log(`  calibration updated (${reason}): ${summary}`);
    await sendAlert(`📊 Daily signal calibration (${reason})\n${summary}`, {
      source: "calibrate",
    });
  }
}

/** @type {any} */
let state = {
  cooldowns: {},
  positions: {},
  pending: {},
  daily: { date: "", pnlEur: 0, trades: 0, losses: 0 },
};

if (existsSync(statePath)) {
  try {
    const loaded = JSON.parse(readFileSync(statePath, "utf8"));
    state = {
      cooldowns: loaded.cooldowns || {},
      positions: loaded.positions || {},
      pending: loaded.pending || {},
      daily: loaded.daily || state.daily,
    };
  } catch {
    /* keep defaults */
  }
}

function saveState() {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDaily() {
  const d = todayUtc();
  if (state.daily.date !== d) {
    state.daily = { date: d, pnlEur: 0, trades: 0, losses: 0 };
    saveState();
  }
}

function cooldownOk(key, sec) {
  const prev = state.cooldowns[key] || 0;
  if (Date.now() - prev < sec * 1000) return false;
  state.cooldowns[key] = Date.now();
  saveState();
  return true;
}

function quoteFromProduct(product) {
  return String(product).split("-")[1]?.toUpperCase() || "EUR";
}

function baseFromProduct(product) {
  return String(product).split("-")[0].toUpperCase();
}

function cashAvailable(balances, quote) {
  const row = balances.find((b) => b.currency === quote);
  return row?.available ?? 0;
}

function inTradingWindow() {
  if (cfg.skipWeekends) {
    const day = new Date().getUTCDay(); // 0 Sun .. 6 Sat
    if (day === 0 || day === 6) return false;
  }
  const hours = cfg.allowedHoursUtc;
  if (!Array.isArray(hours) || !hours.length) return true;
  const h = new Date().getUTCHours();
  return hours.includes(h);
}

function dailyBlocked() {
  ensureDaily();
  const maxLoss = Number(cfg.maxDailyLossEur ?? 15);
  const maxTrades = Number(cfg.maxDailyTrades ?? 6);
  if (state.daily.pnlEur <= -Math.abs(maxLoss)) {
    return `daily loss cap €${Math.abs(maxLoss)} (now ${state.daily.pnlEur.toFixed(2)})`;
  }
  if (state.daily.trades >= maxTrades) {
    return `daily trade cap ${maxTrades}`;
  }
  return null;
}

async function alert(msg, extra) {
  console.log("  alert:", msg);
  try {
    await sendAlert(msg, extra);
  } catch (err) {
    console.error("  alert failed:", err.message);
  }
}

function journal(entry) {
  try {
    appendJournal(journalPath, entry);
  } catch (err) {
    console.error("  journal failed:", err.message);
  }
}

async function execute(signal) {
  if (!cfg.execute) {
    console.log("  (execute=false — signal only)");
    return { skipped: true, dry: true, ok: true };
  }
  if (!tradeSecret) throw new Error("TRADE_API_SECRET required to execute");

  const body = {
    ticker: signal.product,
    action: signal.action,
    strategy: signal.strategy,
    price: signal.price,
    source: "algo",
  };
  if (signal.action === "buy") {
    body.quoteSize = signal.quoteSize ?? cfg.quoteSize ?? 25;
  } else {
    if (!signal.baseSize || Number(signal.baseSize) <= 0) {
      throw new Error("refusing sell: no algo-tracked qty");
    }
    body.baseSize = signal.baseSize;
  }
  if (signal.orderType) body.orderType = signal.orderType;
  if (signal.limitPrice != null) body.limitPrice = signal.limitPrice;
  if (typeof signal.postOnly === "boolean") body.postOnly = signal.postOnly;

  const res = await fetch(tradeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-trade-secret": tradeSecret,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.reason || data.error || `trade ${res.status}`);
  }
  return data;
}

function orderIdFromResult(result) {
  return (
    result?.order?.order_id ||
    result?.order_id ||
    result?.order?.orderId ||
    null
  );
}

function isFilledStatus(status) {
  const s = String(status || "").toUpperCase();
  return s === "FILLED" || s === "DONE" || s.includes("FILL");
}

function isOpenStatus(status) {
  const s = String(status || "").toUpperCase();
  return ["OPEN", "PENDING", "QUEUED", "ACTIVE"].includes(s) || s.includes("PEND");
}

function isDeadStatus(status) {
  const s = String(status || "").toUpperCase();
  return ["CANCELLED", "CANCELED", "EXPIRED", "FAILED", "REJECTED"].some((x) =>
    s.includes(x),
  );
}

/** Poll pending limit; promote to position on fill; cancel if stale. */
async function reconcilePending(product) {
  const pending = state.pending[product];
  if (!pending?.orderId) return;

  const maxAgeSec = Number(cfg.limitTtlSec ?? 1800);
  const ageSec = (Date.now() - new Date(pending.placedAt).getTime()) / 1000;

  let order;
  try {
    order = await getOrder(pending.orderId);
  } catch (err) {
    console.error(`  pending ${product}: getOrder failed`, err.message);
    return;
  }

  const status = order.status || order.order_status;
  const filled = Number(order.filled_size || 0);
  const avg = Number(order.average_filled_price || pending.limitPrice || 0);
  console.log(
    `  pending ${pending.side} ${product}: status=${status} filled=${filled}`,
  );

  if (isFilledStatus(status) || filled > 0) {
    if (pending.side === "BUY" && filled > 0) {
      const quoteSpent = avg * filled;
      state.positions[product] = {
        entry: avg,
        qty: filled,
        quoteSpent,
        peakPrice: avg,
        scaledOut: false,
        openedAt: new Date().toISOString(),
        entryOrderId: pending.orderId,
        entryRsi: pending.rsi ?? null,
      };
      delete state.pending[product];
      ensureDaily();
      state.daily.trades += 1;
      saveState();
      journal({
        event: "fill_buy",
        product,
        qty: filled,
        entry: avg,
        rsi: pending.rsi,
        orderId: pending.orderId,
      });
      await alert(
        `✅ BUY filled ${product}: ${filled} @ ${avg} (RSI ${pending.rsi ?? "?"})`,
        { product, side: "buy", entry: avg, qty: filled },
      );
      return;
    }

    if (pending.side === "SELL" && filled > 0) {
      const pos = state.positions[product];
      const entry = pos?.entry || pending.entry || avg;
      const pnlPct = ((avg - entry) / entry) * 100;
      const pnlEur = (avg - entry) * filled;
      const frac = pending.sellFraction ?? 1;

      ensureDaily();
      state.daily.pnlEur += pnlEur;
      state.daily.trades += 1;
      if (pnlEur < 0) state.daily.losses += 1;

      journal({
        event: pending.markScaledOut ? "scale_out" : "fill_sell",
        product,
        qty: filled,
        entry,
        exit: avg,
        pnlPct: Number(pnlPct.toFixed(3)),
        pnlEur: Number(pnlEur.toFixed(4)),
        reason: pending.reason,
        orderId: pending.orderId,
        rsi: pending.rsi,
      });

      if (pending.markScaledOut && pos && frac < 1) {
        const remain = Math.max(0, Number(pos.qty) - filled);
        if (remain > 1e-10) {
          state.positions[product] = {
            ...pos,
            qty: remain,
            scaledOut: true,
            peakPrice: Math.max(pos.peakPrice || entry, avg),
          };
        } else {
          delete state.positions[product];
        }
      } else {
        delete state.positions[product];
      }
      delete state.pending[product];
      saveState();
      await alert(
        `${pnlEur >= 0 ? "✅" : "⚠️"} SELL filled ${product}: ${filled} @ ${avg} · ${pnlPct.toFixed(2)}% (€${pnlEur.toFixed(2)}) · ${pending.reason || ""}`,
        { product, side: "sell", pnlPct, pnlEur },
      );
      return;
    }
  }

  if (isDeadStatus(status)) {
    delete state.pending[product];
    saveState();
    await alert(`ℹ️ Order ${status} ${product} ${pending.side}`, {
      product,
      status,
    });
    return;
  }

  if (isOpenStatus(status) && ageSec > maxAgeSec) {
    try {
      await cancelOrder(pending.orderId);
      console.log(`  cancelled stale ${pending.side} ${product} after ${Math.round(ageSec)}s`);
      delete state.pending[product];
      saveState();
      await alert(
        `⏱️ Cancelled stale ${pending.side} ${product} (>${maxAgeSec}s)`,
        { product },
      );
    } catch (err) {
      console.error("  cancel failed:", err.message);
    }
  }
}

async function evaluateProduct(product, balances) {
  await reconcilePending(product);

  // Don't fire new signals while an order is working
  if (state.pending[product]?.orderId) {
    console.log(`· ${product} → waiting on pending ${state.pending[product].side}`);
    return;
  }

  if (!inTradingWindow()) {
    console.log(`· ${product} → outside trading window (UTC hour/weekend filter)`);
    return;
  }

  const blocked = dailyBlocked();
  if (blocked) {
    console.log(`· ${product} → ${blocked}`);
    return;
  }

  // Spread gate (entries and non-stop exits)
  let spread = null;
  try {
    spread = await getSpreadPct(product);
    if (spread) {
      console.log(
        `  spread ${spread.spreadPct.toFixed(4)}% (bid ${spread.bid} ask ${spread.ask})`,
      );
    }
  } catch (err) {
    console.error("  spread check failed:", err.message);
  }
  const maxSpread = Number(cfg.maxSpreadPct ?? 0.08);

  const lookback = cfg.candleLookback || 120;
  const candles = await getCandles(
    product,
    cfg.granularity || "ONE_HOUR",
    lookback,
  );
  const price = await getTickerPrice(product);
  const strategyName = cfg.strategy || "pct-scalp";
  let position = state.positions[product] || null;
  const quote = quoteFromProduct(product);
  const base = baseFromProduct(product);
  const cash = cashAvailable(balances, quote);
  const pcfg = productCfg(product);

  // Update peak for trailing while flat signal path
  if (position?.entry && price > (position.peakPrice || 0)) {
    position = { ...position, peakPrice: Number(price) };
    state.positions[product] = position;
    saveState();
  }

  const { signal, meta } = runStrategy(strategyName, candles, pcfg, position);

  const pnl = meta.pnlPct != null ? ` pnl=${meta.pnlPct}%` : "";
  const reason = meta.reason ? ` (${meta.reason})` : "";
  console.log(
    `· ${product} @ ${price}` +
      (meta.rsi != null ? ` RSI=${meta.rsi}` : "") +
      ` buy≤${pcfg.rsiBuyBelow} TP${pcfg.takeProfitPct}/SL${pcfg.stopLossPct}` +
      pnl +
      ` cash=${quote} ${cash.toFixed(2)}` +
      (position ? ` lot=${position.qty}${position.scaledOut ? " scaled" : ""}` : " lot=none") +
      ` → ${signal ?? "hold"}${reason}`,
  );

  if (meta.checks) {
    const c = meta.checks;
    console.log(
      `  entry checks: RSI_dip=${c.rsiDip} trend=${c.nearTrend} macd=${c.macdNotBearish}`,
    );
  }

  if (!signal) return;

  const isStop = String(meta.reason || "").startsWith("stop-loss");
  if (!isStop && spread && spread.spreadPct > maxSpread) {
    console.log(
      `  skip: spread ${spread.spreadPct.toFixed(3)}% > max ${maxSpread}%`,
    );
    return;
  }

  if (signal === "sell") {
    if (!position?.qty || position.qty <= 0) {
      console.log(`  skip sell ${base}: no algo lot`);
      return;
    }
  }

  let quoteSize;
  if (signal === "buy") {
    if (position?.qty > 0) {
      console.log(`  skip buy: already holding algo lot on ${product}`);
      return;
    }
    const want = Number(cfg.quoteSize ?? 25);
    const reserve = Number(cfg.cashReserve ?? 1);
    const spendable = Math.max(0, cash - reserve);
    if (spendable < Number(cfg.minQuoteSize ?? 5)) {
      console.log(
        `  skip buy: insufficient ${quote} (have ${cash.toFixed(2)})`,
      );
      return;
    }
    quoteSize = Number(Math.min(want, spendable).toFixed(2));
  }

  const key = `${strategyName}:${product}:${signal}:${meta.reason || ""}`;
  if (!cooldownOk(key, cfg.cooldownSec ?? 900)) {
    console.log(`  cooldown active`);
    return;
  }

  try {
    let baseSize;
    const frac = meta.sellFraction ?? 1;
    if (signal === "sell") {
      baseSize = Number((Number(position.qty) * frac * 0.995).toFixed(8));
      if (!(baseSize > 0)) {
        console.log("  skip sell: qty too small");
        return;
      }
    }

    const orderType =
      meta.orderType ||
      (cfg.preferLimit === false || isStop ? "market" : "limit");

    const result = await execute({
      product,
      action: signal,
      strategy: meta.strategy,
      price,
      quoteSize,
      baseSize,
      orderType,
      limitPrice: meta.limitPrice ?? spread?.bid ?? price,
      postOnly: orderType === "limit" && meta.postOnly !== false,
    });
    console.log("  trade:", JSON.stringify(result));

    const paper = Boolean(result?.skipped || result?.dryRun || !cfg.execute);
    const oid = orderIdFromResult(result);

    if (paper) {
      // Paper: simulate immediate fill for strategy continuity
      if (signal === "buy") {
        const spent = Number(quoteSize ?? cfg.quoteSize ?? 25);
        const qty = spent / Number(price);
        state.positions[product] = {
          entry: Number(price),
          qty,
          quoteSpent: spent,
          peakPrice: Number(price),
          scaledOut: false,
          openedAt: new Date().toISOString(),
          entryRsi: meta.rsi,
        };
        saveState();
      } else if (signal === "sell") {
        if (meta.markScaledOut && frac < 1 && position) {
          state.positions[product] = {
            ...position,
            qty: Number(position.qty) * (1 - frac),
            scaledOut: true,
            peakPrice: Math.max(position.peakPrice || position.entry, price),
          };
        } else {
          delete state.positions[product];
        }
        saveState();
      }
      journal({
        event: `paper_${signal}`,
        product,
        price,
        rsi: meta.rsi,
        reason: meta.reason,
      });
      return;
    }

    if (oid && orderType === "limit") {
      state.pending[product] = {
        orderId: oid,
        side: signal.toUpperCase(),
        placedAt: new Date().toISOString(),
        limitPrice: meta.limitPrice ?? price,
        quoteSize,
        baseSize,
        sellFraction: frac,
        markScaledOut: Boolean(meta.markScaledOut),
        reason: meta.reason,
        rsi: meta.rsi,
        entry: position?.entry,
      };
      saveState();
      await alert(
        `📨 ${signal.toUpperCase()} limit placed ${product} id=${oid} · ${meta.reason || ""}`,
        { product, orderId: oid, side: signal },
      );
      journal({
        event: "place_limit",
        product,
        side: signal,
        orderId: oid,
        limitPrice: meta.limitPrice ?? price,
        rsi: meta.rsi,
        reason: meta.reason,
      });
      return;
    }

    // Market / immediate: treat as filled estimate
    if (signal === "buy") {
      const spent = Number(quoteSize ?? cfg.quoteSize ?? 25);
      const qty = spent / Number(price);
      state.positions[product] = {
        entry: Number(price),
        qty,
        quoteSpent: spent,
        peakPrice: Number(price),
        scaledOut: false,
        openedAt: new Date().toISOString(),
        entryOrderId: oid,
        entryRsi: meta.rsi,
      };
      ensureDaily();
      state.daily.trades += 1;
      saveState();
      await alert(`✅ BUY market ${product} ~${qty} @ ${price}`, {
        product,
        side: "buy",
      });
      journal({
        event: "market_buy",
        product,
        price,
        qty,
        rsi: meta.rsi,
        orderId: oid,
      });
    } else if (signal === "sell") {
      const entry = position.entry;
      const pnlPct = ((price - entry) / entry) * 100;
      const pnlEur = ((price - entry) / entry) * (position.quoteSpent || price * baseSize);
      ensureDaily();
      state.daily.pnlEur += pnlEur;
      state.daily.trades += 1;
      if (pnlEur < 0) state.daily.losses += 1;

      if (meta.markScaledOut && frac < 1) {
        state.positions[product] = {
          ...position,
          qty: Number(position.qty) * (1 - frac),
          scaledOut: true,
          peakPrice: Math.max(position.peakPrice || entry, price),
        };
      } else {
        delete state.positions[product];
      }
      saveState();
      await alert(
        `${pnlEur >= 0 ? "✅" : "⚠️"} SELL market ${product} ${pnlPct.toFixed(2)}% · ${meta.reason}`,
        { product, side: "sell", pnlPct },
      );
      journal({
        event: "market_sell",
        product,
        price,
        entry,
        pnlPct,
        pnlEur,
        reason: meta.reason,
        orderId: oid,
        rsi: meta.rsi,
      });
    }
  } catch (err) {
    console.error("  execute failed:", err.message);
    delete state.cooldowns[key];
    saveState();
    await alert(`❌ Trade error ${product}: ${err.message}`, {
      product,
      error: err.message,
    });
  }
}

async function tick() {
  console.log(`\n[${new Date().toISOString()}] strategy=${cfg.strategy}`);
  await ensureCalibration("daily");
  ensureDaily();
  console.log(
    `  daily: trades=${state.daily.trades} pnl€=${state.daily.pnlEur.toFixed(2)} losses=${state.daily.losses}` +
      (calibration?.calibratedAt
        ? ` · signals@${calibration.calibratedAt.slice(0, 10)}`
        : ""),
  );

  let balances = [];
  try {
    balances = await fetchBalances();
    const cashRows = balances.filter(
      (b) => CASH.has(b.currency) && b.available > 0,
    );
    console.log(
      "  cash:",
      cashRows.map((b) => `${b.currency}=${b.available.toFixed(2)}`).join(" ") ||
        "(none)",
    );
  } catch (err) {
    console.error("  balance fetch failed:", err.message);
    await alert(`❌ Balance fetch failed: ${err.message}`);
  }

  for (const product of cfg.products || []) {
    try {
      await evaluateProduct(product, balances);
    } catch (err) {
      console.error(product, err.message);
      await alert(`❌ ${product}: ${err.message}`);
    }
  }
}

const pollMs = (cfg.pollSec || 60) * 1000;
console.log(
  `Algo started → ${cfg.strategy} on ${(cfg.products || []).join(", ")} every ${cfg.pollSec || 60}s`,
);
console.log(
  `Upgrades: fills+TTL · trail · scale-out · spread · time window · daily caps · alerts · journal · 30d calibrate`,
);
console.log(
  `Base TP +${cfg.takeProfitPctMin ?? 3}–${cfg.takeProfitPctMax ?? 5}% · stop −${cfg.stopLossPct ?? 3}% · RSI≤${cfg.rsiBuyBelow ?? 32} (overridden per pair by daily calibration)`,
);
console.log(`Trade API: ${tradeUrl}`);
console.log(`Journal: ${journalPath}`);

calibration = loadCalibrationFile();
await ensureCalibration("startup");

await tick();
setInterval(tick, pollMs);
