import {
  rsi,
  sma,
  momentumPct,
  macd,
  volumeSurge,
  supportResistance,
} from "../lib/indicators.mjs";

export function rsiMeanReversion(closes, cfg) {
  const value = rsi(closes, cfg.rsiPeriod ?? 14);
  if (value == null) return { signal: null, meta: { rsi: null } };
  const buyBelow = cfg.rsiBuyBelow ?? 30;
  const sellAbove = cfg.rsiSellAbove ?? 70;
  let signal = null;
  if (value <= buyBelow) signal = "buy";
  else if (value >= sellAbove) signal = "sell";
  return {
    signal,
    meta: { strategy: "rsi-mean-reversion", rsi: Number(value.toFixed(2)) },
  };
}

export function smaCross(closes, cfg) {
  const fastN = cfg.smaFast ?? 9;
  const slowN = cfg.smaSlow ?? 21;
  if (closes.length < slowN + 2) {
    return { signal: null, meta: { strategy: "sma-cross" } };
  }
  const prevFast = sma(closes.slice(0, -1), fastN);
  const prevSlow = sma(closes.slice(0, -1), slowN);
  const curFast = sma(closes, fastN);
  const curSlow = sma(closes, slowN);
  if ([prevFast, prevSlow, curFast, curSlow].some((v) => v == null)) {
    return { signal: null, meta: { strategy: "sma-cross" } };
  }
  let signal = null;
  if (prevFast <= prevSlow && curFast > curSlow) signal = "buy";
  if (prevFast >= prevSlow && curFast < curSlow) signal = "sell";
  return {
    signal,
    meta: {
      strategy: "sma-cross",
      fast: Number(curFast.toFixed(4)),
      slow: Number(curSlow.toFixed(4)),
    },
  };
}

export function momentumBreakout(closes, cfg) {
  const lookback = cfg.momentumLookback ?? 12;
  const threshold = cfg.momentumThresholdPct ?? 3;
  const m = momentumPct(closes, lookback);
  if (m == null) return { signal: null, meta: { strategy: "momentum" } };
  let signal = null;
  if (m >= threshold) signal = "buy";
  else if (m <= -threshold) signal = "sell";
  return {
    signal,
    meta: { strategy: "momentum", momentumPct: Number(m.toFixed(2)) },
  };
}

export function rsiMacdMa200(closes, cfg) {
  const value = rsi(closes, cfg.rsiPeriod ?? 14);
  const ma200 = sma(closes, cfg.maPeriod ?? 200);
  const m = macd(closes, cfg.macdFast ?? 12, cfg.macdSlow ?? 26, cfg.macdSignal ?? 9);
  const price = closes[closes.length - 1];
  const rsiBuyBelow = cfg.rsiBuyBelow ?? 30;
  const meta = {
    strategy: "rsi-macd-ma200",
    price,
    rsi: value != null ? Number(value.toFixed(2)) : null,
    ma200: ma200 != null ? Number(ma200.toFixed(6)) : null,
    macdBullishCross: m?.bullishCross ?? false,
    aboveMa200: ma200 != null && price != null ? price > ma200 : false,
    rsiOversold: value != null ? value < rsiBuyBelow : false,
  };
  if (value == null || ma200 == null || m == null) {
    return { signal: null, meta: { ...meta, ready: false } };
  }
  const longSetup = value < rsiBuyBelow && m.bullishCross && price > ma200;
  return {
    signal: longSetup ? "buy" : null,
    meta: { ...meta, ready: true, longSetup },
  };
}

/**
 * Full confluence (daily OHLCV):
 *  RSI < 30
 *  MACD bullish cross
 *  Price above MA50 and MA200 (MA50 > MA200 preferred = uptrend stack)
 *  Volume above its 20-day average
 *  Price near support (within 1.5%) and not hugging resistance
 */
export function fullConfluence(candles, cfg) {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const price = closes[closes.length - 1];

  const rsiPeriod = cfg.rsiPeriod ?? 14;
  const rsiBuyBelow = cfg.rsiBuyBelow ?? 30;
  const ma50 = sma(closes, cfg.maFast ?? 50);
  const ma200 = sma(closes, cfg.maSlow ?? 200);
  const m = macd(
    closes,
    cfg.macdFast ?? 12,
    cfg.macdSlow ?? 26,
    cfg.macdSignal ?? 9,
  );
  const value = rsi(closes, rsiPeriod);
  const vol = volumeSurge(volumes, cfg.volumePeriod ?? 20);
  const sr = supportResistance(
    candles,
    cfg.srLookback ?? 60,
    cfg.srSwing ?? 3,
  );

  const rsiOk = value != null && value < rsiBuyBelow;
  const macdOk = Boolean(m?.bullishCross);
  const aboveMa50 = ma50 != null && price > ma50;
  const aboveMa200 = ma200 != null && price > ma200;
  const maStackOk = aboveMa50 && aboveMa200;
  const volumeOk = Boolean(vol?.aboveAverage);
  const supportOk = Boolean(sr?.nearSupport);
  const notAtResistance = sr ? !sr.nearResistance : true;

  const checks = {
    rsiOversold: rsiOk,
    macdBullishCross: macdOk,
    aboveMa50,
    aboveMa200,
    volumeAboveAvg: volumeOk,
    nearSupport: supportOk,
    notNearResistance: notAtResistance,
  };

  const required = [
    "rsiOversold",
    "macdBullishCross",
    "aboveMa50",
    "aboveMa200",
    "volumeAboveAvg",
    "nearSupport",
    "notNearResistance",
  ];
  // Allow config to drop optional checks
  const optional = new Set(cfg.optionalChecks || []);
  const active = required.filter((k) => !optional.has(k));
  const longSetup = active.every((k) => checks[k]);
  const score = required.filter((k) => checks[k]).length;

  const meta = {
    strategy: "full-confluence",
    ready: value != null && ma50 != null && ma200 != null && m != null && vol != null && sr != null,
    price: price != null ? Number(price.toFixed(6)) : null,
    rsi: value != null ? Number(value.toFixed(2)) : null,
    ma50: ma50 != null ? Number(ma50.toFixed(6)) : null,
    ma200: ma200 != null ? Number(ma200.toFixed(6)) : null,
    macd: m ? Number(m.macd.toFixed(6)) : null,
    macdSignal: m ? Number(m.signal.toFixed(6)) : null,
    volumeRatio: vol ? Number(vol.ratio.toFixed(2)) : null,
    support: sr?.support != null ? Number(sr.support.toFixed(6)) : null,
    resistance: sr?.resistance != null ? Number(sr.resistance.toFixed(6)) : null,
    checks,
    score: `${score}/${required.length}`,
    longSetup,
    maStackOk,
  };

  return {
    signal: longSetup ? "buy" : null,
    meta,
  };
}

/**
 * Small-profit takeout scalp (fee-aware):
 *  Buy RSI dips with maker bias
 *  Scale out 50% at TP, trail the rest
 *  Stop ~−3%
 *
 * position may include: { entry, qty, peakPrice, scaledOut }
 */
export function pctScalp(closes, cfg, position = null) {
  const rsiPeriod = cfg.rsiPeriod ?? 14;
  const value = rsi(closes, rsiPeriod);
  const price = closes[closes.length - 1];
  const maFast = sma(closes, cfg.maFast ?? 20);
  const m = macd(
    closes,
    cfg.macdFast ?? 12,
    cfg.macdSlow ?? 26,
    cfg.macdSignal ?? 9,
  );

  const feeBuffer = cfg.feeBufferPct ?? 1.0;
  const tpMin = Math.max(cfg.takeProfitPctMin ?? 3, feeBuffer + 1.5);
  const tpTarget = Math.max(cfg.takeProfitPct ?? 3.5, tpMin);
  const tpMax = cfg.takeProfitPctMax ?? 5;
  const stopLoss = cfg.stopLossPct ?? 3;
  const rsiBuyBelow = cfg.rsiBuyBelow ?? 32;
  const rsiSellAbove = cfg.rsiSellAbove ?? 65;
  const trailArm = cfg.trailArmPct ?? tpTarget;
  const trailPct = cfg.trailPct ?? 0.75;
  const scalePct = cfg.scaleOutPct ?? 0.5; // fraction to sell at first TP

  const meta = {
    strategy: "pct-scalp",
    price: price != null ? Number(price.toFixed(6)) : null,
    rsi: value != null ? Number(value.toFixed(2)) : null,
    maFast: maFast != null ? Number(maFast.toFixed(6)) : null,
    takeProfitPct: tpTarget,
    takeProfitBand: `${tpMin}-${tpMax}`,
    stopLossPct: stopLoss,
    feeBufferPct: feeBuffer,
    preferLimit: cfg.preferLimit !== false,
    inPosition: Boolean(position?.entry),
    peakPrice: position?.peakPrice ?? null,
    scaledOut: Boolean(position?.scaledOut),
  };

  if (price == null || value == null) {
    return { signal: null, meta: { ...meta, ready: false } };
  }

  if (position?.entry) {
    const entry = Number(position.entry);
    const peak = Math.max(Number(position.peakPrice || entry), price);
    const pnlPct = ((price - entry) / entry) * 100;
    const dropFromPeak = ((peak - price) / peak) * 100;
    meta.entry = entry;
    meta.pnlPct = Number(pnlPct.toFixed(3));
    meta.peakPrice = Number(peak.toFixed(6));
    meta.dropFromPeak = Number(dropFromPeak.toFixed(3));
    meta.targetPrice = Number((entry * (1 + tpTarget / 100)).toFixed(6));
    meta.stopPrice = Number((entry * (1 - stopLoss / 100)).toFixed(6));
    meta.updatePeak = peak > Number(position.peakPrice || 0);

    // Hard stop — full exit market
    if (pnlPct <= -stopLoss) {
      return {
        signal: "sell",
        meta: {
          ...meta,
          ready: true,
          reason: `stop-loss −${stopLoss}%`,
          sellFraction: 1,
          orderType: "market",
          postOnly: false,
        },
      };
    }

    // Cap take-profit — full exit
    if (pnlPct >= tpMax) {
      return {
        signal: "sell",
        meta: {
          ...meta,
          ready: true,
          reason: `take-profit max ${tpMax}%`,
          sellFraction: 1,
          orderType: "limit",
          limitPrice: price,
          postOnly: true,
        },
      };
    }

    // Trailing exit on remainder (after arm)
    if (pnlPct >= trailArm && dropFromPeak >= trailPct) {
      return {
        signal: "sell",
        meta: {
          ...meta,
          ready: true,
          reason: `trail −${trailPct}% from peak`,
          sellFraction: 1,
          orderType: "limit",
          limitPrice: price,
          postOnly: true,
        },
      };
    }

    // First takeout: scale out half at target (once)
    if (!position.scaledOut && pnlPct >= tpTarget) {
      return {
        signal: "sell",
        meta: {
          ...meta,
          ready: true,
          reason: `scale-out ${Math.round(scalePct * 100)}% @ ≥${tpTarget}%`,
          sellFraction: scalePct,
          markScaledOut: true,
          orderType: "limit",
          limitPrice: Number((entry * (1 + tpTarget / 100)).toFixed(6)),
          postOnly: true,
        },
      };
    }

    // Fee-aware RSI early exit (full) if never scaled
    if (!position.scaledOut && value >= rsiSellAbove && pnlPct >= tpMin) {
      return {
        signal: "sell",
        meta: {
          ...meta,
          ready: true,
          reason: `RSI≥${rsiSellAbove} with ≥${tpMin}% (fee-aware)`,
          sellFraction: 1,
          orderType: "limit",
          limitPrice: price,
          postOnly: true,
        },
      };
    }

    return {
      signal: null,
      meta: {
        ...meta,
        ready: true,
        reason: position.scaledOut
          ? `trailing remainder (arm ${trailArm}%, trail ${trailPct}%)`
          : `holding for +${tpTarget}% scale-out`,
      },
    };
  }

  const dipOk = value <= rsiBuyBelow;
  const trendOk = maFast == null || price >= maFast * 0.97;
  const macdOk = m == null || m.histogram >= 0 || m.bullishCross;
  const longSetup = dipOk && trendOk && macdOk;

  return {
    signal: longSetup ? "buy" : null,
    meta: {
      ...meta,
      ready: true,
      reason: longSetup ? `entry RSI≤${rsiBuyBelow}` : "wait for dip",
      orderType: cfg.preferLimit === false ? "market" : "limit",
      limitPrice: longSetup ? Number((price * 0.999).toFixed(6)) : undefined,
      postOnly: cfg.preferLimit !== false,
      checks: {
        rsiDip: dipOk,
        nearTrend: trendOk,
        macdNotBearish: macdOk,
      },
    },
  };
}

export function runStrategy(name, data, cfg, position = null) {
  // data may be closes[] (legacy) or candles[] (full confluence)
  const isCandles =
    Array.isArray(data) && data.length && typeof data[0] === "object" && "close" in data[0];
  const closes = isCandles ? data.map((c) => c.close) : data;

  switch (name) {
    case "sma-cross":
      return smaCross(closes, cfg);
    case "momentum":
      return momentumBreakout(closes, cfg);
    case "rsi-mean-reversion":
      return rsiMeanReversion(closes, cfg);
    case "rsi-macd-ma200":
      return rsiMacdMa200(closes, cfg);
    case "full-confluence":
      if (!isCandles) {
        return {
          signal: null,
          meta: { strategy: "full-confluence", ready: false, error: "needs OHLCV candles" },
        };
      }
      return fullConfluence(data, cfg);
    case "pct-scalp":
    default:
      return pctScalp(closes, cfg, position);
  }
}
