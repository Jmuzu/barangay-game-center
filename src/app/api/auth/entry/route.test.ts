/** @jest-environment node */

import { createHmac } from "node:crypto";
import { POST } from "./route";

const secret = "shared-parent-child-sso-secret-for-tests";
const parentOrigin = "http://parent.test";

function launchToken(jti = "launch-once", origin = parentOrigin) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: "barangay-platform",
    aud: "barangay-game-center",
    purpose: "launch",
    sub: "platform-user-001",
    sid: "parent-session-001",
    jti,
    origin,
    iat: now,
    exp: now + 60,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function request(token: string, origin = parentOrigin) {
  return new Request("http://game-center.test/api/auth/entry", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

describe("Game Center launch API exchange", () => {
  const oldSecret = process.env.GAME_CENTER_SSO_SECRET;
  const oldApiUrl = process.env.GAME_CENTER_API_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GAME_CENTER_SSO_SECRET = secret;
    process.env.GAME_CENTER_API_URL = "http://api.test";
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      sessionToken: "api-issued-child-session",
    }), { status: 200 })) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (oldSecret === undefined) delete process.env.GAME_CENTER_SSO_SECRET;
    else process.env.GAME_CENTER_SSO_SECRET = oldSecret;
    if (oldApiUrl === undefined) delete process.env.GAME_CENTER_API_URL;
    else process.env.GAME_CENTER_API_URL = oldApiUrl;
  });

  it("exchanges the launch token with Nest and sets an HttpOnly cookie", async () => {
    const response = await POST(request(launchToken()));

    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("api-issued-child-session");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://api.test/api/auth/launch/exchange");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("origin")).toBe(parentOrigin);
  });

  it("maps API replay rejection to the existing replay screen", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response("{}", { status: 409 })) as typeof fetch;
    const response = await POST(request(launchToken("replayed")));
    expect(response.headers.get("location")).toContain("reason=replayed");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an untrusted launch origin before calling the API", async () => {
    const response = await POST(request(launchToken("bad-origin"), "https://attacker.test"));
    expect(response.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});