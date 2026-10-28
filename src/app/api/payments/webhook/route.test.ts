/** @jest-environment node */

import { proxyGameCenterApi } from "@code/api/gameCenterApi";
import { POST } from "./route";

jest.mock("@code/api/gameCenterApi", () => ({ proxyGameCenterApi: jest.fn() }));

describe("PayMongo webhook API proxy", () => {
  it("forwards signed raw webhook requests without a player session", async () => {
    const request = new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: { "Paymongo-Signature": "test-signature" },
      body: "{\"data\":{}}",
    });
    await POST(request);
    expect(proxyGameCenterApi).toHaveBeenCalledWith(request, "payments/webhook", { authenticated: false });
  });
});