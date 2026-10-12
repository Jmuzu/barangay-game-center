import { NextResponse } from "next/server";
import { consumeParentLaunch } from "@code/database/sqlite";
import { exchangeLaunchToken, GAME_CENTER_SESSION_COOKIE, verifyLaunchToken } from "@code/auth/parentSession";

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
    const exchange = await exchangeLaunchToken(token);
    const consumed = consumeParentLaunch(exchange.user, exchange.launchId, exchange.parentSessionId, exchange.expiresAt);
    if (!consumed) return NextResponse.redirect(new URL("/auth/required?reason=replayed", baseUrl), 303);

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