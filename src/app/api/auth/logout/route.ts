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
  const gameCenterOrigin = new URL(resolveBaseUrl(request)).origin;
  if (request.headers.get("origin") !== gameCenterOrigin) {
    return NextResponse.json({ message: "Invalid sign-out origin." }, { status: 403 });
  }

  const parentUrl = process.env.BARANGAY_PLATFORM_URL;
  if (!parentUrl) {
    return NextResponse.json({ message: "Barangay Platform URL is not configured." }, { status: 503 });
  }
  let parentBase: URL;
  try {
    parentBase = new URL(parentUrl);
  } catch {
    return NextResponse.json({ message: "Barangay Platform URL is invalid." }, { status: 503 });
  }

  const formData = await request.formData().catch(() => null);
  const returnUrlValue = formData?.get("returnUrl");
  const allowedPaths = new Set(["/dashboard", "/admin", "/superadmin"]);
  let returnUrl = new URL("/dashboard", parentBase);
  if (typeof returnUrlValue === "string") {
    try {
      const requestedUrl = new URL(returnUrlValue);
      if (
        requestedUrl.origin === parentBase.origin &&
        allowedPaths.has(requestedUrl.pathname) &&
        !requestedUrl.search &&
        !requestedUrl.hash
      ) {
        returnUrl = requestedUrl;
      }
    } catch {
      // Use the default parent dashboard for invalid return targets.
    }
  }

  const response = NextResponse.redirect(returnUrl, 303);
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