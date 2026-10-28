/** @jest-environment node */

import { proxyGameCenterApi } from "@code/api/gameCenterApi";
import { GET, POST } from "./route";

jest.mock("@code/api/gameCenterApi", () => ({ proxyGameCenterApi: jest.fn() }));

describe("checkout API proxy", () => {
  it("reads checkout availability without requiring a player session", async () => {
    const request = new Request("http://localhost/api/payments/checkout");
    await GET(request);
    expect(proxyGameCenterApi).toHaveBeenCalledWith(request, "payments/checkout", { authenticated: false });
  });

  it("forwards authenticated checkout creation", async () => {
    const request = new Request("http://localhost/api/payments/checkout", { method: "POST", body: "{}" });
    await POST(request);
    expect(proxyGameCenterApi).toHaveBeenCalledWith(request, "payments/checkout");
  });
});