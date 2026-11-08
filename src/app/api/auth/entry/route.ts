import { randomUUID } from "node:crypto";
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

export async function GET(request: Request) {
  const baseUrl = resolveBaseUrl(request);
  return NextResponse.redirect(new URL("/auth/required", baseUrl), 303);
}

export async function POST(request: Request) {
  const traceId = randomUUID();
  const baseUrl = resolveBaseUrl(request);
  let stage = "read_form";
  let failureStatus: number | undefined;
  let token = "";
  try {
    const formData = await request.formData();
    token = String(formData.get("token") ?? "");
    if (!token) {
      logLaunchEvent("rejected", traceId, stage, { reason: "token_missing" });
      return NextResponse.redirect(new URL("/auth/required?reason=invalid", baseUrl), 303);
    }
  } catch {
    logLaunchEvent("rejected", traceId, stage, { reason: "form_parse_failed" });
    return NextResponse.redirect(new URL("/auth/required?reason=invalid", baseUrl), 303);
  }

  try {
    stage = "verify_launch_token";
    const claims = verifyLaunchToken(token);
    logLaunchEvent("passed", traceId, stage);

    stage = "verify_request_origin";
    const requestOrigin = request.headers.get("origin");
    if (!claims.origin || (requestOrigin !== claims.origin && requestOrigin !== "null")) {
      logLaunchEvent("rejected", traceId, stage, { reason: "origin_mismatch" });
      return NextResponse.json({ message: "Invalid launch origin." }, { status: 403 });
    }

    stage = "resolve_api_url";
    const apiUrl = process.env.GAME_CENTER_API_URL ??
      (process.env.NODE_ENV !== "production" ? "http://localhost:3200" : undefined);
    if (!apiUrl) {
      logLaunchEvent("failed", traceId, stage, { reason: "api_url_missing" });
      throw new Error("Game Center API is not configured.");
    }

    stage = "exchange_launch_token";
    logLaunchEvent("started", traceId, stage);
    const exchangeResponse = await fetch(new URL("/api/auth/launch/exchange", apiUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin ?? "null",
        "x-game-center-trace-id": traceId,
      },
      body: JSON.stringify({ token }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    logLaunchEvent("response_received", traceId, stage, {
      status: exchangeResponse.status,
    });
    if (exchangeResponse.status === 409) {
      logLaunchEvent("rejected", traceId, stage, { reason: "launch_replayed" });
      return NextResponse.redirect(new URL("/auth/required?reason=replayed", baseUrl), 303);
    }
    if (!exchangeResponse.ok) {
      failureStatus = exchangeResponse.status;
      throw new Error("Launch exchange failed.");
    }
    const exchange = await exchangeResponse.json() as { sessionToken?: string };
    if (!exchange.sessionToken) {
      stage = "validate_exchange_response";
      throw new Error("Launch exchange returned no session.");
    }

    stage = "issue_child_session";
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
    logLaunchEvent("completed", traceId, stage);
    return response;
  } catch (error) {
    logLaunchEvent("failed", traceId, stage, {
      errorName: error instanceof Error ? error.name : "UnknownError",
      reason: stage === "verify_launch_token"
        ? "launch_token_rejected"
        : stage === "exchange_launch_token"
          ? "api_exchange_failed"
          : undefined,
      status: failureStatus,
    });
    return NextResponse.redirect(new URL("/auth/required?reason=invalid", baseUrl), 303);
  }
}

function logLaunchEvent(
  outcome: string,
  traceId: string,
  stage: string,
  details: Record<string, string | number | undefined> = {},
) {
  const message = JSON.stringify({
    event: "game_center_sso",
    outcome,
    traceId,
    stage,
    ...details,
  });
  if (outcome === "failed") {
    console.error(message);
  } else if (outcome === "rejected") {
    console.warn(message);
  } else {
    console.info(message);
  }
}