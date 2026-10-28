/** @jest-environment node */

import { cookies } from "next/headers";
import { proxyGameCenterApi } from "./gameCenterApi";

jest.mock("next/headers", () => ({ cookies: jest.fn() }));

describe("Game Center API server proxy", () => {
  const oldApiUrl = process.env.GAME_CENTER_API_URL;
  const oldNodeEnv = process.env.NODE_ENV;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GAME_CENTER_API_URL = "http://api.test";
    (cookies as jest.Mock).mockResolvedValue({
      get: () => ({ value: "http-only-child-token" }),
    });
    global.fetch = jest.fn().mockResolvedValue(new Response("{\"ok\":true}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (oldApiUrl === undefined) delete process.env.GAME_CENTER_API_URL;
    else process.env.GAME_CENTER_API_URL = oldApiUrl;
    (process.env as Record<string, string | undefined>).NODE_ENV = oldNodeEnv;
  });

  it("forwards the HttpOnly cookie as Bearer auth without returning the token", async () => {
    const request = new Request("http://localhost/api/state");
    const response = await proxyGameCenterApi(request, "state");
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];

    expect(new Headers(init.headers).get("authorization")).toBe("Bearer http-only-child-token");
    expect(await response.text()).toBe('{"ok":true}');
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects protected requests without a child-session cookie", async () => {
    (cookies as jest.Mock).mockResolvedValue({ get: () => undefined });
    const response = await proxyGameCenterApi(new Request("http://localhost/api/state"), "state");
    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});