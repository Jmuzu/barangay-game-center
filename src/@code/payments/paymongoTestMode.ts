import { createHmac, timingSafeEqual } from "node:crypto";

const SUPPORTED_TEST_PAYMENT_METHODS = new Set(["gcash", "paymaya", "grab_pay", "shopeepay"] as const);

export type PayMongoTestPaymentMethod = "gcash" | "paymaya" | "grab_pay" | "shopeepay";

export function getPayMongoTestSecret(): string | null {
  const secret = process.env.PAYMONGO_SECRET_KEY;
  // Sandbox only: live keys are rejected by the prefix check, so test keys are safe on hosted (production) builds.
  if (!secret?.startsWith("sk_test_")) return null;
  return secret;
}

export function verifyPayMongoTestWebhook(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string | undefined,
): boolean {
  if (!signatureHeader || !webhookSecret) return false;
  const suppliedSignature = signatureHeader.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(suppliedSignature)) return false;

  const expectedSignature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expectedSignature, "hex"), Buffer.from(suppliedSignature, "hex"));
}

export function getPayMongoTestPaymentMethods(configuredMethods = process.env.PAYMONGO_PAYMENT_METHOD_TYPES): PayMongoTestPaymentMethod[] {
  if (!configuredMethods?.trim()) return ["gcash"];

  const methods = configuredMethods
    .split(",")
    .map((method) => method.trim().toLowerCase())
    .filter((method): method is PayMongoTestPaymentMethod => SUPPORTED_TEST_PAYMENT_METHODS.has(method as PayMongoTestPaymentMethod));

  return [...new Set(methods)];
}