/** @jest-environment node */

import { proxyGameCenterApi } from "@code/api/gameCenterApi";
import { POST } from "./route";

jest.mock("@code/api/gameCenterApi", () => ({ proxyGameCenterApi: jest.fn() }));

describe("game-play API proxy", () => {
  it("forwards authenticated, idempotent play requests to Nest", async () => {
    const request = new Request("http://localhost/api/games/play", {
      method: "POST",
      headers: { "Idempotency-Key": "play-request-001" },
      body: JSON.stringify({ gameKey: "fruit-game" }),
    });
    await POST(request);
    expect(proxyGameCenterApi).toHaveBeenCalledWith(request, "games/play");
  });
});