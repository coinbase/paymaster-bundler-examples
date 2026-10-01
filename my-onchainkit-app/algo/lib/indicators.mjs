/**
 * Technical indicators for the trading algo.
 */

export function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

export function emaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null;
  const fastE = emaSeries(closes, fast);
  const slowE = emaSeries(closes, slow);
  const macdLine = closes.map((_, i) =>
    fastE[i] != null && slowE[i] != null ? fastE[i] - slowE[i] : null,
  );

  let first = -1;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] != null) {
      first = i;
      break;
    }
  }
  if (first < 0) return null;
  const seedEnd = first + signalPeriod - 1;
  if (seedEnd >= macdLine.length) return null;

  const signalLine = new Array(closes.length).fill(null);
  let prev =
    macdLine.slice(first, seedEnd + 1).reduce((a, b) => a + b, 0) / signalPeriod;
  const k = 2 / (signalPeriod + 1);
  signalLine[seedEnd] = prev;
  for (let i = seedEnd + 1; i < macdLine.length; i++) {
    if (macdLine[i] == null) continue;
    prev = macdLine[i] * k + prev * (1 - k);
    signalLine[i] = prev;
  }

  const pairs = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] != null && signalLine[i] != null) {
      pairs.push({ macd: macdLine[i], signal: signalLine[i] });
    }
  }
  if (pairs.length < 2) return null;
  const prevP = pairs[pairs.length - 2];
  const curP = pairs[pairs.length - 1];

  return {
    macd: curP.macd,
    signal: curP.signal,
    histogram: curP.macd - curP.signal,
    bullishCross: prevP.macd <= prevP.signal && curP.macd > curP.signal,
    bearishCross: prevP.macd >= prevP.signal && curP.macd < curP.signal,
  };
}

export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function momentumPct(closes, lookback = 12) {
  if (closes.length < lookback + 1) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - lookback];
  if (!then) return null;
  return ((now - then) / then) * 100;
}

/** Volume vs its SMA — ratio > 1 means above-average volume. */
export function volumeSurge(volumes, period = 20) {
  if (volumes.length < period + 1) return null;
  const avg = sma(volumes.slice(0, -1), period);
  const last = volumes[volumes.length - 1];
  if (avg == null || !avg) return null;
  return {
    last,
    avg,
    ratio: last / avg,
    aboveAverage: last > avg,
  };
}

/**
 * Simple swing support/resistance from recent highs/lows.
 * Support = recent troughs; Resistance = recent peaks.
 */
export function supportResistance(candles, lookback = 60, swing = 3) {
  if (candles.length < lookback) return null;
  const window = candles.slice(-lookback);
  const supports = [];
  const resistances = [];

  for (let i = swing; i < window.length - swing; i++) {
    const hi = window[i].high;
    const lo = window[i].low;
    let isPeak = true;
    let isTrough = true;
    for (let j = 1; j <= swing; j++) {
      if (window[i - j].high >= hi || window[i + j].high >= hi) isPeak = false;
      if (window[i - j].low <= lo || window[i + j].low <= lo) isTrough = false;
    }
    if (isPeak) resistances.push(hi);
    if (isTrough) supports.push(lo);
  }

  const price = window[window.length - 1].close;
  // Nearest levels
  const supportBelow = supports.filter((s) => s <= price).sort((a, b) => b - a)[0] ?? null;
  const resistanceAbove =
    resistances.filter((r) => r >= price).sort((a, b) => a - b)[0] ?? null;

  const nearPct = 0.015; // within 1.5%
  const nearSupport =
    supportBelow != null && (price - supportBelow) / price <= nearPct;
  const nearResistance =
    resistanceAbove != null && (resistanceAbove - price) / price <= nearPct;

  return {
    support: supportBelow,
    resistance: resistanceAbove,
    nearSupport,
    nearResistance,
    supportCount: supports.length,
    resistanceCount: resistances.length,
  };
}
