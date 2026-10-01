import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { config } from "dotenv";

config({ path: ".env.local" });

const j = JSON.parse(readFileSync(process.env.CDP_API_KEY_FILE, "utf8"));
const id = j.name || j.id;
const secret = j.privateKey || j.private_key;
const method = "POST";
const host = "api.developer.coinbase.com";
const path = "/onramp/v1/token";
const now = Math.floor(Date.now() / 1000);
const token = jwt.sign(
  {
    iss: "cdp",
    nbf: now,
    exp: now + 120,
    sub: id,
    uri: `${method} ${host}${path}`,
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

const res = await fetch(`https://${host}${path}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    addresses: [
      {
        address: "0x0000000000000000000000000000000000000001",
        blockchains: ["base", "ethereum"],
      },
    ],
    clientIp: "192.0.2.1",
  }),
});

console.log("status", res.status);
console.log((await res.text()).slice(0, 300));
