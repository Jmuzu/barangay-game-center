/** @jest-environment node */

import { POST } from "./route";

const gameCenterOrigin = "http://game-center.test";
const parentOrigin = "http://parent.test";

function logoutRequest(origin = gameCenterOrigin, returnUrl = `${parentOrigin}/dashboard`) {
  return new Request(`${gameCenterOrigin}/api/auth/logout`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ returnUrl }),
  });
}

describe("Game Center logout", () => {
  const oldGameCenterBaseUrl = process.env.GAME_CENTER_BASE_URL;
  const oldParentUrl = process.env.BARANGAY_PLATFORM_URL;

  beforeEach(() => {
    process.env.GAME_CENTER_BASE_URL = gameCenterOrigin;
    process.env.BARANGAY_PLATFORM_URL = parentOrigin;
  });

  afterEach(() => {
    if (oldGameCenterBaseUrl === undefined) delete process.env.GAME_CENTER_BASE_URL;
    else process.env.GAME_CENTER_BASE_URL = oldGameCenterBaseUrl;
    if (oldParentUrl === undefined) delete process.env.BARANGAY_PLATFORM_URL;
    else process.env.BARANGAY_PLATFORM_URL = oldParentUrl;
  });

  it("clears the child session and returns to the requested parent dashboard", async () => {
    const response = await POST(logoutRequest(gameCenterOrigin, `${parentOrigin}/admin`));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${parentOrigin}/admin`);
    expect(response.headers.get("set-cookie")).toContain("brgy_game_center_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects requests from a different origin without clearing the cookie", async () => {
    const response = await POST(logoutRequest("http://attacker.test"));

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("falls back to the parent dashboard for an untrusted return target", async () => {
    const response = await POST(logoutRequest(gameCenterOrigin, "https://attacker.test"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${parentOrigin}/dashboard`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});