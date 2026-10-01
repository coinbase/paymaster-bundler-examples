"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { FundButton } from "@coinbase/onchainkit/fund";

type Mode = "buy" | "sell";

export function OnOffRampPanel() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("20");
  const [asset, setAsset] = useState("ETH");
  const [busy, setBusy] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundingUrl, setFundingUrl] = useState<string | undefined>();

  const startFlow = useCallback(
    async (mode: Mode) => {
      if (!address) {
        setError("Connect a wallet first");
        return;
      }
      setBusy(mode);
      setError(null);
      try {
        const res = await fetch("/api/onramp/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            address,
            mode,
            blockchains: ["base", "ethereum"],
            defaultAsset: asset,
            defaultNetwork: "base",
            presetFiatAmount: Number(amount) || undefined,
            fiatCurrency: "USD",
            redirectUrl: window.location.origin,
            partnerUserRef: `user-${address.slice(2, 10).toLowerCase()}`,
          }),
        });
        const data = (await res.json()) as {
          url?: string;
          error?: string;
        };
        if (!res.ok || !data.url) {
          throw new Error(data.error || `Session failed (${res.status})`);
        }
        if (mode === "buy") {
          setFundingUrl(data.url);
        }
        window.open(data.url, "_blank", "noopener,noreferrer");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [address, amount, asset],
  );

  return (
    <section className="w-full max-w-md mx-auto rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4 bg-white/70 dark:bg-black/40">
      <div>
        <h2 className="text-lg font-semibold">Onramp / Offramp</h2>
        <p className="text-sm opacity-70 mt-1">
          Buy crypto with fiat (onramp) or cash out to bank (offramp) via
          Coinbase-hosted Pay.
        </p>
      </div>

      {!isConnected ? (
        <p className="text-sm opacity-80">Connect your wallet to continue.</p>
      ) : (
        <>
          <label className="block text-sm">
            <span className="opacity-70">Asset</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2"
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
            >
              <option value="ETH">ETH</option>
              <option value="USDC">USDC</option>
              <option value="BTC">BTC</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="opacity-70">Preset amount (USD)</span>
            <input
              type="number"
              min={1}
              step={1}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => startFlow("buy")}
              className="flex-1 rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {busy === "buy" ? "Opening…" : "Buy (Onramp)"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => startFlow("sell")}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {busy === "sell" ? "Opening…" : "Sell (Offramp)"}
            </button>
          </div>

          {fundingUrl ? (
            <div className="pt-1">
              <p className="text-xs opacity-60 mb-2">
                Or use OnchainKit Fund button with the session URL:
              </p>
              <FundButton fundingUrl={fundingUrl} text="Fund with Coinbase" />
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          <p className="text-xs opacity-50">
            Wallet: {address?.slice(0, 6)}…{address?.slice(-4)} · Base /
            Ethereum · Prod offramp needs your domain on the CDP redirect
            allowlist.
          </p>
        </>
      )}
    </section>
  );
}
