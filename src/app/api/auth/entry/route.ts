import { NextResponse } from "next/server";
import { GAME_CENTER_SESSION_COOKIE, verifyLaunchToken } from "@code/auth/parentSession";

export const runtime = "nodejs";

function resolveBaseUrl(request: Request): string {
  if (process.env.GAME_CENTER_BASE_URL) {
    return process.env.GAME_CENTER_BASE_URL;
  }
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return request.url;
}

export async function POST(request: Request) {
  const baseUrl = resolveBaseUrl(request);
  let token = "";
  try {
    const formData = await request.formData();
    token = String(formData.get("token") ?? "");
  } catch {
    return NextResponse.redirect(new URL("/auth/required", baseUrl), 303);
  }

  try {
    const claims = verifyLaunchToken(token);
    const requestOrigin = request.headers.get("origin");
    if (!claims.origin || (requestOrigin !== claims.origin && requestOrigin !== "null")) {
      return NextResponse.json({ message: "Invalid launch origin." }, { status: 403 });
    }
    const apiUrl = process.env.GAME_CENTER_API_URL ??
      (process.env.NODE_ENV !== "production" ? "http://localhost:3200" : undefined);
    if (!apiUrl) throw new Error("Game Center API is not configured.");
    const exchangeResponse = await fetch(new URL("/api/auth/launch/exchange", apiUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin ?? "null",
      },
      body: JSON.stringify({ token }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (exchangeResponse.status === 409) {
      return NextResponse.redirect(new URL("/auth/required?reason=replayed", baseUrl), 303);
    }
    if (!exchangeResponse.ok) throw new Error("Launch exchange failed.");
    const exchange = await exchangeResponse.json() as { sessionToken?: string };
    if (!exchange.sessionToken) throw new Error("Launch exchange returned no session.");

    const response = NextResponse.redirect(new URL("/", baseUrl), 303);
    response.cookies.set(GAME_CENTER_SESSION_COOKIE, exchange.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/auth/required?reason=invalid", baseUrl), 303);
  }
}