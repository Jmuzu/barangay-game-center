import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEVELOPMENT_KEY = "brgy-game-center-development-key";
const ALGORITHM = "aes-256-gcm";
const SIGNATURE_ALGORITHM = "HMAC-SHA256";

function encryptionKey(): Buffer {
  const configuredKey = process.env.GAME_CENTER_SECRET_KEY;
  return createHash("sha256").update(configuredKey ?? DEVELOPMENT_KEY).digest();
}

export function encryptProviderSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptProviderSecret(value: string): string {
  if (!value) return "";
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return value;
  }
  try {
    const [ivValue, authTagValue, encryptedValue] = parts;
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return value;
  }
}

export function signInbetweenPayload(payload: Record<string, unknown>, secret: string): string {
  const canonicalValue = Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([, value]) => String(value))
    .join("");
  return createHmac("sha256", secret).update(canonicalValue).digest("hex");
}

export function isValidSignature(payload: Record<string, unknown>, signature: string, secret: string): boolean {
  const expected = signInbetweenPayload(payload, secret);
  if (!/^[a-f0-9]+$/i.test(signature) || expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature.toLowerCase(), "utf8"));
}

export { SIGNATURE_ALGORITHM };
