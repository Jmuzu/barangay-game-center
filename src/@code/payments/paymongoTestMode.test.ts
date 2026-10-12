import { createHmac } from "node:crypto";
import { getPayMongoTestPaymentMethods, getPayMongoTestSecret, verifyPayMongoTestWebhook } from "./paymongoTestMode";

describe("PayMongo test-mode security", () => {
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.PAYMONGO_SECRET_KEY;

  afterEach(() => {
    mutableEnvironment.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete process.env.PAYMONGO_SECRET_KEY;
    else process.env.PAYMONGO_SECRET_KEY = originalSecret;
  });

  it("accepts only a test secret, including on hosted production builds", () => {
    mutableEnvironment.NODE_ENV = "development";
    process.env.PAYMONGO_SECRET_KEY = "sk_test_demo";
    expect(getPayMongoTestSecret()).toBe("sk_test_demo");

    process.env.PAYMONGO_SECRET_KEY = "sk_live_not-allowed";
    expect(getPayMongoTestSecret()).toBeNull();

    mutableEnvironment.NODE_ENV = "production";
    process.env.PAYMONGO_SECRET_KEY = "sk_test_demo";
    expect(getPayMongoTestSecret()).toBe("sk_test_demo");

    process.env.PAYMONGO_SECRET_KEY = "sk_live_not-allowed";
    expect(getPayMongoTestSecret()).toBeNull();
  });

  it("verifies the raw webhook body with a constant-time HMAC signature", () => {
    const rawBody = '{"data":{"id":"evt_test"}}';
    const webhookSecret = "test-webhook-secret";
    const signature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

    expect(verifyPayMongoTestWebhook(rawBody, signature, webhookSecret)).toBe(true);
    expect(verifyPayMongoTestWebhook(`${rawBody} `, signature, webhookSecret)).toBe(false);
    expect(verifyPayMongoTestWebhook(rawBody, "not-a-signature", webhookSecret)).toBe(false);
    expect(verifyPayMongoTestWebhook(rawBody, signature, undefined)).toBe(false);
  });

  it("defaults to GCash and filters configured test methods against the supported allowlist", () => {
    expect(getPayMongoTestPaymentMethods("")).toEqual(["gcash"]);
    expect(getPayMongoTestPaymentMethods("gcash, shopeepay, invalid")).toEqual(["gcash", "shopeepay"]);
    expect(getPayMongoTestPaymentMethods("shopeepay,shopeepay")).toEqual(["shopeepay"]);
    expect(getPayMongoTestPaymentMethods("unsupported")).toEqual([]);
  });
});