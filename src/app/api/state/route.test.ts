/** @jest-environment node */

import { proxyGameCenterApi } from "@code/api/gameCenterApi";
import { DELETE, GET, PUT } from "./route";

jest.mock("@code/api/gameCenterApi", () => ({
  proxyGameCenterApi: jest.fn(),
}));

const mockProxy = jest.mocked(proxyGameCenterApi);

describe("player state API proxy", () => {
  const request = new Request("http://localhost/api/state", { method: "GET" });

  beforeEach(() => mockProxy.mockReset());

  it("forwards state reads to the Nest API", async () => {
    await GET(request);
    expect(mockProxy).toHaveBeenCalledWith(request, "state");
  });

  it("forwards state writes and resets to the Nest API", async () => {
    const putRequest = new Request("http://localhost/api/state", { method: "PUT" });
    const deleteRequest = new Request("http://localhost/api/state", { method: "DELETE" });
    await PUT(putRequest);
    await DELETE(deleteRequest);
    expect(mockProxy).toHaveBeenNthCalledWith(1, putRequest, "state");
    expect(mockProxy).toHaveBeenNthCalledWith(2, deleteRequest, "state");
  });
});