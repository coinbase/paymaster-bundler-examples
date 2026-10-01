/**
 * Daily signal calibration from latest N days of hourly OHLCV.
 * Picks per-product RSI / TP / SL that maximized fee-aware net return.
 *
 *   node algo/calibrate.mjs
 *   node algo/calibrate.mjs --force
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { rsi, sma, macd } from "./lib/indicators.mjs";
// candles fetched via public Coinbase market API (paginated)

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
loadEnv({ path: join(root, ".env.local") });
loadEnv({ path: join(root, ".env") });

const configPath = join(__dirname, "algo.config.json");
const outPath = join(__dirname, "signals.calibrated.json");
const cfg = JSON.parse(readFileSync(configPath, "utf8"));

const days = Number(cfg.calibrateDays ?? 30);
const feeRt = Number(cfg.feeBufferPct ?? 1.0);
const force = process.argv.includes("--force");

const RSI_GRID = [25, 28, 30, 32, 35, 38, 40];
const TP_GRID = [3, 3.5, 4, 5];
const SL_GRID = [2.5, 3, 4];

async function fetchMonth(product) {
  const out = [];
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 24 * 3600;
  let cursor = end;
  for (let k = 0; k < 8; k++) {
    const url = new URL(
      `https://api.coinbase.com/api/v3/brokerage/market/products/${product}/candles`,
    );
    url.searchParams.set("granularity", "ONE_HOUR");
    url.searchParams.set("start", String(Math.max(start, cursor - 300 * 3600)));
    url.searchParams.set("end", String(cursor));
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`candles ${product}: ${res.status}`);
    }
    const data = await res.json();
    const batch = (data.candles || []).map((c) => ({
      time: Number(c.start),
      open: +c.open,
      high: +c.high,
      low: +c.low,
      close: +c.close,
      volume: +c.volume,
    }));
    if (!batch.length) break;
    out.push(...batch);
    const oldest = Math.min(...batch.map((b) => b.time));
    if (oldest >= cursor) break;
    cursor = oldest - 1;
    if (cursor <= start) break;
  }
  const map = new Map(out.map((c) => [c.time, c]));
  return [...map.values()]
    .filter((c) => Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);
}

function backtest(closes, params) {
  const { rsiBuyBelow, takeProfitPct, stopLossPct } = params;
  const period = 14;
  let i = 50;
  const trades = [];
  while (i < closes.length - 2) {
    const slice = closes.slice(0, i + 1);
    const value = rsi(slice, period);
    const ma = sma(slice, 20);
    const m = macd(slice, 12, 26, 9);
    if (value == null) {
      i++;
      continue;
    }
    const price = closes[i];
    const dipOk = value <= rsiBuyBelow;
    const trendOk = ma == null || price >= ma * 0.97;
    const macdOk = m == null || m.histogram >= 0 || m.bullishCross;
    if (!(dipOk && trendOk && macdOk)) {
      i++;
      continue;
    }

    const entry = price;
    let exit = closes[Math.min(i + 72, closes.length - 1)];
    let reason = "timeout";
    let exitIdx = Math.min(i + 72, closes.length - 1);
    for (let j = i + 1; j <= Math.min(i + 72, closes.length - 1); j++) {
      const pnl = ((closes[j] - entry) / entry) * 100;
      if (pnl >= takeProfitPct) {
        exit = closes[j];
        reason = "tp";
        exitIdx = j;
        break;
      }
      if (pnl <= -stopLossPct) {
        exit = closes[j];
        reason = "sl";
        exitIdx = j;
        break;
      }
    }
    const gross = ((exit - entry) / entry) * 100;
    trades.push({ gross, net: gross - feeRt, reason, entryRsi: value });
    i = exitIdx + 1;
  }

  const wins = trades.filter((t) => t.net > 0);
  const totalNet = trades.reduce((a, t) => a + t.net, 0);
  const avgNet = trades.length ? totalNet / trades.length : 0;
  const winRate = trades.length ? wins.length / trades.length : 0;
  const tp = trades.filter((t) => t.reason === "tp").length;
  const sl = trades.filter((t) => t.reason === "sl").length;
  // Prefer total net, then win rate, then more trades (but not noise)
  const score = totalNet + winRate * 2 + Math.min(trades.length, 8) * 0.1;
  return {
    trades: trades.length,
    winRate,
    avgNet,
    totalNet,
    tp,
    sl,
    score,
  };
}

function calibrateProduct(candles) {
  const closes = candles.map((c) => c.close);
  let best = null;
  for (const rsiBuyBelow of RSI_GRID) {
    for (const takeProfitPct of TP_GRID) {
      for (const stopLossPct of SL_GRID) {
        // Avoid awful R:R — stop should not dwarf TP by too much
        if (stopLossPct > takeProfitPct * 1.5) continue;
        const stats = backtest(closes, {
          rsiBuyBelow,
          takeProfitPct,
          stopLossPct,
        });
        if (stats.trades < 1) continue;
        const row = {
          rsiBuyBelow,
          takeProfitPct,
          takeProfitPctMin: Math.max(2.5, takeProfitPct - 0.5),
          takeProfitPctMax: Math.max(takeProfitPct, 5),
          stopLossPct,
          trailArmPct: takeProfitPct,
          trailPct: 0.75,
          scaleOutPct: 0.5,
          ...stats,
        };
        if (!best || row.score > best.score) best = row;
      }
    }
  }
  // Fallback defaults if too few trades
  if (!best) {
    return {
      rsiBuyBelow: cfg.rsiBuyBelow ?? 32,
      takeProfitPct: cfg.takeProfitPct ?? 3.5,
      takeProfitPctMin: cfg.takeProfitPctMin ?? 3,
      takeProfitPctMax: cfg.takeProfitPctMax ?? 5,
      stopLossPct: cfg.stopLossPct ?? 3,
      trailArmPct: cfg.trailArmPct ?? 3.5,
      trailPct: 0.75,
      scaleOutPct: 0.5,
      trades: 0,
      winRate: 0,
      avgNet: 0,
      totalNet: 0,
      tp: 0,
      sl: 0,
      score: 0,
      fallback: true,
    };
  }
  return best;
}

export async function runCalibration({ silent = false } = {}) {
  if (!force && existsSync(outPath)) {
    try {
      const prev = JSON.parse(readFileSync(outPath, "utf8"));
      const ageMs = Date.now() - new Date(prev.calibratedAt).getTime();
      const everyMs =
        Number(cfg.calibrateEveryHours ?? 24) * 3600 * 1000;
      if (ageMs < everyMs) {
        if (!silent) {
          console.log(
            `Calibration fresh (${(ageMs / 3600000).toFixed(1)}h old) — skip`,
          );
        }
        return prev;
      }
    } catch {
      /* recalibrate */
    }
  }

  const products = cfg.products || [];
  const byProduct = {};
  if (!silent) {
    console.log(
      `Calibrating ${products.join(", ")} on last ${days}d hourly…`,
    );
  }

  for (const product of products) {
    try {
      const candles = await fetchMonth(product);
      const best = calibrateProduct(candles);
      byProduct[product] = {
        ...best,
        winRate: Number((best.winRate * 100).toFixed(1)),
        avgNet: Number(best.avgNet.toFixed(3)),
        totalNet: Number(best.totalNet.toFixed(3)),
        bars: candles.length,
      };
      if (!silent) {
        const b = byProduct[product];
        console.log(
          `  ${product}: RSI≤${b.rsiBuyBelow} TP+${b.takeProfitPct}% SL−${b.stopLossPct}%` +
            ` trades=${b.trades} WR=${b.winRate}% totalNet=${b.totalNet}%` +
            (b.fallback ? " [fallback]" : ""),
        );
      }
    } catch (err) {
      console.error(`  ${product} calibrate failed:`, err.message);
      byProduct[product] = {
        error: err.message,
        rsiBuyBelow: cfg.rsiBuyBelow ?? 32,
        takeProfitPct: cfg.takeProfitPct ?? 3.5,
        takeProfitPctMin: 3,
        takeProfitPctMax: 5,
        stopLossPct: 3,
        trailArmPct: 3.5,
        trailPct: 0.75,
        scaleOutPct: 0.5,
        fallback: true,
      };
    }
  }

  const payload = {
    calibratedAt: new Date().toISOString(),
    days,
    feeBufferPct: feeRt,
    byProduct,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  if (!silent) console.log(`Wrote ${outPath}`);
  return payload;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  await runCalibration({ silent: false });
}
