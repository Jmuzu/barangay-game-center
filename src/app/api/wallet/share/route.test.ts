/** @jest-environment node */

import { proxyGameCenterApi } from "@code/api/gameCenterApi";
import { GET, POST } from "./route";

jest.mock("@code/api/gameCenterApi", () => ({
  proxyGameCenterApi: jest.fn(),
}));

const mockProxy = jest.mocked(proxyGameCenterApi);

describe("wallet share API proxy", () => {
  beforeEach(() => mockProxy.mockReset());

  it("forwards eligible-recipient reads to the Nest API", async () => {
    const request = new Request("http://localhost/api/wallet/share");
    await GET(request);
    expect(mockProxy).toHaveBeenCalledWith(request, "wallet/share");
  });

  it("forwards transfers and preserves the idempotency header", async () => {
    const request = new Request("http://localhost/api/wallet/share", {
      method: "POST",
      headers: { "Idempotency-Key": "transfer-request-1" },
      body: JSON.stringify({ recipientId: "player-2", amount: 5 }),
    });
    await POST(request);
    expect(mockProxy).toHaveBeenCalledWith(request, "wallet/share");
  });
});