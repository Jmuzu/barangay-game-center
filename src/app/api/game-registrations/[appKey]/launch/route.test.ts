/** @jest-environment node */

import { proxyGameCenterApi } from "@code/api/gameCenterApi";
import { GET } from "./route";

jest.mock("@code/api/gameCenterApi", () => ({ proxyGameCenterApi: jest.fn() }));

describe("game launch API proxy", () => {
  it("forwards the selected registration key", async () => {
    const request = new Request("http://localhost/api/game-registrations/fruit-game/launch");
    await GET(request, { params: Promise.resolve({ appKey: "fruit-game" }) });
    expect(proxyGameCenterApi).toHaveBeenCalledWith(request, "game-registrations/fruit-game/launch");
  });
});