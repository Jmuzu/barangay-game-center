/** @jest-environment node */

import { proxyGameCenterApi } from "@code/api/gameCenterApi";
import { POST } from "./route";

jest.mock("@code/api/gameCenterApi", () => ({ proxyGameCenterApi: jest.fn() }));

describe("provider integration API proxy", () => {
  it("forwards signed provider requests without a player session", async () => {
    const request = new Request("http://localhost/api/integrations/fruit-game/balance", {
      method: "POST",
      body: JSON.stringify({ username: "player-1", gameType: "fruit-game", sign: "signed" }),
    });
    await POST(request, { params: Promise.resolve({ appKey: "fruit-game", operation: "balance" }) });
    expect(proxyGameCenterApi).toHaveBeenCalledWith(request, "integrations/fruit-game/balance", { authenticated: false });
  });
});