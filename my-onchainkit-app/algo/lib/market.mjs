const REST = "https://api.coinbase.com/api/v3/brokerage";

export async function getTickerPrice(product) {
  const res = await fetch(`${REST}/market/products/${product}/ticker`);
  if (!res.ok) throw new Error(`ticker ${product}: ${res.status}`);
  const data = await res.json();
  const price = Number(
    data.price ?? data.trades?.[0]?.price ?? data.best_bid ?? data.best_ask,
  );
  if (!Number.isFinite(price)) throw new Error(`no price for ${product}`);
  return price;
}

/**
 * Full OHLCV candles oldest→newest.
 * For ONE_DAY, lookback is days; otherwise hours.
 */
export async function getCandles(
  product,
  granularity = "ONE_DAY",
  lookback = 260,
) {
  const end = new Date();
  const ms =
    granularity === "ONE_DAY"
      ? lookback * 24 * 60 * 60 * 1000
      : lookback * 60 * 60 * 1000;
  const start = new Date(end.getTime() - ms);
  const url = new URL(`${REST}/market/products/${product}/candles`);
  url.searchParams.set("start", Math.floor(start.getTime() / 1000).toString());
  url.searchParams.set("end", Math.floor(end.getTime() / 1000).toString());
  url.searchParams.set("granularity", granularity);
  url.searchParams.set("limit", "300");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`candles ${product}: ${res.status}`);
  const data = await res.json();
  const candles = (data.candles || [])
    .map((c) => ({
      start: Number(c.start ?? c[0]),
      low: Number(c.low ?? c[1]),
      high: Number(c.high ?? c[2]),
      open: Number(c.open ?? c[3]),
      close: Number(c.close ?? c[4]),
      volume: Number(c.volume ?? c[5]),
    }))
    .filter(
      (c) =>
        Number.isFinite(c.close) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.volume),
    )
    .sort((a, b) => a.start - b.start);

  return candles;
}

/** Closes only (compat). */
export async function getCloses(product, granularity = "ONE_DAY", lookback = 260) {
  const candles = await getCandles(product, granularity, lookback);
  return candles.map((c) => c.close);
}
