import { NextResponse } from "next/server";
import { GAME_CENTER_SESSION_COOKIE } from "@code/auth/parentSession";

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
  const parentOrigin = process.env.BARANGAY_PLATFORM_URL;
  if (!parentOrigin || request.headers.get("origin") !== new URL(parentOrigin).origin) {
    return NextResponse.json({ message: "Invalid sign-out origin." }, { status: 403 });
  }
  const baseUrl = resolveBaseUrl(request);
  const response = NextResponse.redirect(new URL("/auth/required", baseUrl), 303);
  response.cookies.set(GAME_CENTER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}