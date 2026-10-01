/**
 * Local Coinbase trading agent CLI (no Next server required).
 *
 *   npm run agent -- balances
 *   npm run agent -- "buy $2 of ETH"
 *   npm run agent -- "price BTC"
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
loadEnv({ path: join(root, ".env.local") });
loadEnv({ path: join(root, ".env") });

const require = createRequire(import.meta.url);

// Prefer compiled/ts via tsx when available; else hit local API if running.
const message = process.argv.slice(2).join(" ").trim() || "help";

async function viaHttp() {
  const secret = process.env.TRADE_API_SECRET;
  const base = process.env.AGENT_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/agent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-trade-secret": secret || "",
    },
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

async function viaLib() {
  // Dynamic import of TS through next's path won't work in plain node —
  // use HTTP when server is up; otherwise run smoke helpers with jwt.
  const { readFileSync, existsSync } = await import("fs");
  const { randomBytes } = await import("crypto");
  const jwt = require("jsonwebtoken");

  const file = process.env.CDP_API_KEY_FILE;
  if (!file || !existsSync(file)) {
    throw new Error("CDP_API_KEY_FILE not set");
  }
  const key = JSON.parse(readFileSync(file, "utf8"));
  const id = key.name || key.id;
  const secret = key.privateKey || key.private_key;

  const sign = (method, path) => {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iss: "cdp",
        nbf: now,
        exp: now + 120,
        sub: id,
        uri: `${method} api.coinbase.com${path}`,
      },
      secret,
      {
        algorithm: "ES256",
        header: {
          kid: id,
          nonce: randomBytes(16).toString("hex"),
          typ: "JWT",
        },
      },
    );
  };

  const m = message.toLowerCase();
  if (/balance|portfolio|holdings/.test(m) || m === "balances") {
    const token = sign("GET", "/api/v3/brokerage/accounts");
    const res = await fetch("https://api.coinbase.com/api/v3/brokerage/accounts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const slim = (data.accounts || [])
      .filter((a) => Number(a.available_balance?.value || 0) > 0)
      .map((a) => `${a.currency}: ${a.available_balance.value}`);
    console.log(slim.join("\n") || "No balances");
    return;
  }

  console.log(
    "For trades/NL commands, start the app (`npm run dev`) then:\n  npm run agent -- \"buy $2 of ETH\"\n\nOffline: npm run agent -- balances",
  );
}

try {
  if (/balance|portfolio|holdings|^balances?$/.test(message.toLowerCase())) {
    await viaLib();
  } else {
    try {
      await viaHttp();
    } catch {
      await viaLib();
    }
  }
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
