/** @jest-environment node */

import { proxyGameCenterApi } from "@code/api/gameCenterApi";
import { GET, PATCH } from "./route";

jest.mock("@code/api/gameCenterApi", () => ({ proxyGameCenterApi: jest.fn() }));

describe("missions API proxy", () => {
  it("forwards catalog reads and admin updates to Nest", async () => {
    const getRequest = new Request("http://localhost/api/missions");
    const patchRequest = new Request("http://localhost/api/missions", { method: "PATCH", body: "{}" });
    await GET(getRequest);
    await PATCH(patchRequest);
    expect(proxyGameCenterApi).toHaveBeenNthCalledWith(1, getRequest, "missions");
    expect(proxyGameCenterApi).toHaveBeenNthCalledWith(2, patchRequest, "missions");
  });
});