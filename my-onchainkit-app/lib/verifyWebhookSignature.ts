import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify CDP webhook signatures (X-Hook0-Signature).
 * Prefers v1 (timestamp + headers + body); falls back to v0 (timestamp + body).
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  headers: Headers,
  maxAgeMinutes = 5,
): boolean {
  try {
    const elements = signatureHeader.split(",");
    const timestamp = elements.find((e) => e.startsWith("t="))?.slice(2);
    const headerNames = elements.find((e) => e.startsWith("h="))?.slice(2);
    const v1 = elements.find((e) => e.startsWith("v1="))?.slice(3);
    const v0 = elements.find((e) => e.startsWith("v0="))?.slice(3);

    if (!timestamp) return false;

    const webhookTime = Number.parseInt(timestamp, 10) * 1000;
    const ageMinutes = (Date.now() - webhookTime) / (1000 * 60);
    if (Number.isNaN(webhookTime) || ageMinutes > maxAgeMinutes) {
      return false;
    }

    const candidates: Array<{ provided?: string; signed: string }> = [];

    if (v1 && headerNames) {
      const headerNameList = headerNames.split(" ");
      const headerValues = headerNameList
        .map((name) => headers.get(name) ?? "")
        .join(".");
      candidates.push({
        provided: v1,
        signed: `${timestamp}.${headerNames}.${headerValues}.${payload}`,
      });
    }

    if (v0) {
      candidates.push({
        provided: v0,
        signed: `${timestamp}.${payload}`,
      });
    }

    for (const candidate of candidates) {
      if (!candidate.provided) continue;
      const expected = createHmac("sha256", secret)
        .update(candidate.signed, "utf8")
        .digest("hex");

      const expectedBuf = Buffer.from(expected, "hex");
      const providedBuf = Buffer.from(candidate.provided, "hex");
      if (
        expectedBuf.length === providedBuf.length &&
        timingSafeEqual(expectedBuf, providedBuf)
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
