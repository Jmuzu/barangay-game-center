/** @jest-environment node */

import { proxyGameCenterApi } from "@code/api/gameCenterApi";
import { GET } from "./route";

jest.mock("@code/api/gameCenterApi", () => ({ proxyGameCenterApi: jest.fn() }));

describe("purchase status API proxy", () => {
  it("forwards a purchase identifier to the authenticated API", async () => {
    const request = new Request("http://localhost/api/payments/purchases/purchase-1");
    await GET(request, { params: Promise.resolve({ purchaseId: "purchase-1" }) });
    expect(proxyGameCenterApi).toHaveBeenCalledWith(request, "payments/purchases/purchase-1");
  });
});