import { randomBytes } from "crypto";
import { readFileSync, existsSync } from "fs";
import jwt from "jsonwebtoken";

const HOST = "api.developer.coinbase.com";
const TOKEN_PATH = "/onramp/v1/token";

type KeyMaterial = { apiKeyId: string; apiKeySecret: string };

function loadKeys(): KeyMaterial {
  const file =
    process.env.CDP_API_KEY_FILE || process.env.COINBASE_KEY_FILE || "";
  if (file && existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      string
    >;
    const apiKeyId = raw.name || raw.id;
    const apiKeySecret =
      raw.privateKey || raw.private_key || raw.api_key_secret;
    if (!apiKeyId || !apiKeySecret) {
      throw new Error("CDP key file missing name/id or privateKey");
    }
    return { apiKeyId, apiKeySecret };
  }

  const apiKeyId = process.env.CDP_API_KEY_ID || process.env.KEY_NAME;
  const apiKeySecret =
    process.env.CDP_API_KEY_SECRET || process.env.KEY_SECRET;
  if (!apiKeyId || !apiKeySecret) {
    throw new Error(
      "Set CDP_API_KEY_FILE or CDP_API_KEY_ID + CDP_API_KEY_SECRET for Onramp",
    );
  }
  return {
    apiKeyId,
    apiKeySecret: apiKeySecret.includes("\\n")
      ? apiKeySecret.replace(/\\n/g, "\n")
      : apiKeySecret,
  };
}

function signOnrampJwt(): string {
  const { apiKeyId, apiKeySecret } = loadKeys();
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: "cdp",
      nbf: now,
      exp: now + 120,
      sub: apiKeyId,
      uri: `POST ${HOST}${TOKEN_PATH}`,
    },
    apiKeySecret,
    {
      algorithm: "ES256",
      header: {
        alg: "ES256",
        kid: apiKeyId,
        nonce: randomBytes(16).toString("hex"),
        typ: "JWT",
      } as jwt.JwtHeader,
    },
  );
}

export type SessionTokenInput = {
  address: string;
  blockchains?: string[];
  assets?: string[];
  clientIp: string;
};

export async function createOnrampSessionToken(
  input: SessionTokenInput,
): Promise<{ token: string; channel_id?: string }> {
  const address = input.address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid EVM address");
  }

  const blockchains =
    input.blockchains?.length ? input.blockchains : ["base", "ethereum"];
  const clientIp = input.clientIp || "192.0.2.1";

  const body: Record<string, unknown> = {
    addresses: [{ address, blockchains }],
    clientIp,
  };
  if (input.assets?.length) {
    body.assets = input.assets;
  }

  const jwtToken = signOnrampJwt();
  const res = await fetch(`https://${HOST}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: { token?: string; channel_id?: string; message?: string } = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }

  if (!res.ok || !data.token) {
    throw new Error(
      `Onramp session token failed (${res.status}): ${data.message || text.slice(0, 200)}`,
    );
  }

  return { token: data.token, channel_id: data.channel_id };
}

export function buildOnrampBuyUrl(opts: {
  sessionToken: string;
  redirectUrl?: string;
  partnerUserRef?: string;
  presetFiatAmount?: number;
  fiatCurrency?: string;
  defaultAsset?: string;
  defaultNetwork?: string;
}): string {
  const url = new URL("https://pay.coinbase.com/buy/select-asset");
  url.searchParams.set("sessionToken", opts.sessionToken);
  if (opts.redirectUrl) url.searchParams.set("redirectUrl", opts.redirectUrl);
  if (opts.partnerUserRef)
    url.searchParams.set("partnerUserRef", opts.partnerUserRef);
  if (opts.presetFiatAmount != null)
    url.searchParams.set("presetFiatAmount", String(opts.presetFiatAmount));
  if (opts.fiatCurrency) url.searchParams.set("fiatCurrency", opts.fiatCurrency);
  if (opts.defaultAsset) url.searchParams.set("defaultAsset", opts.defaultAsset);
  if (opts.defaultNetwork)
    url.searchParams.set("defaultNetwork", opts.defaultNetwork);
  return url.toString();
}

export function buildOfframpSellUrl(opts: {
  sessionToken: string;
  partnerUserRef: string;
  redirectUrl: string;
  presetFiatAmount?: number;
  fiatCurrency?: string;
  defaultAsset?: string;
  defaultNetwork?: string;
}): string {
  const url = new URL("https://pay.coinbase.com/v3/sell/input");
  url.searchParams.set("sessionToken", opts.sessionToken);
  url.searchParams.set("partnerUserRef", opts.partnerUserRef.slice(0, 50));
  url.searchParams.set("redirectUrl", opts.redirectUrl);
  if (opts.presetFiatAmount != null)
    url.searchParams.set("presetFiatAmount", String(opts.presetFiatAmount));
  if (opts.fiatCurrency) url.searchParams.set("fiatCurrency", opts.fiatCurrency);
  if (opts.defaultAsset) url.searchParams.set("defaultAsset", opts.defaultAsset);
  if (opts.defaultNetwork)
    url.searchParams.set("defaultNetwork", opts.defaultNetwork);
  return url.toString();
}

export function clientIpFromRequest(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "192.0.2.1";
  }
  return headers.get("x-real-ip") || "192.0.2.1";
}
