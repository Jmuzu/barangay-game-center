import { NextResponse } from "next/server";
import { getGameCenterSession } from "@code/auth/parentSession";
import { readState, updateMissionConfiguration } from "@code/database/sqlite";
import { MissionStatus } from "@shared/enums";
import { ADMIN_ROLES } from "@shared/utils";
import { validateMissionBonus } from "@shared/helpers";

export const runtime = "nodejs";

export async function GET() {
  const session = await getGameCenterSession();
  if (!session) return NextResponse.json({ message: "Barangay Platform sign-in is required." }, { status: 401 });
  return NextResponse.json(readState().missions, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const session = await getGameCenterSession();
  if (!session) return NextResponse.json({ message: "Barangay Platform sign-in is required." }, { status: 401 });
  if (!ADMIN_ROLES.includes(session.gameCenterRole)) {
    return NextResponse.json({ message: "Administrator role required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Request body must be a JSON object." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const missionId = typeof payload.missionId === "string" ? payload.missionId.trim() : "";
  if (!missionId) return NextResponse.json({ message: "Mission ID is required." }, { status: 400 });

  if (payload.action === "update-bonus") {
    const bonusCoins = payload.bonusCoins;
    if (typeof bonusCoins !== "number" || validateMissionBonus(bonusCoins)) {
      return NextResponse.json({ message: validateMissionBonus(Number(bonusCoins)) ?? "Enter a valid bonus amount." }, { status: 400 });
    }
    const result = updateMissionConfiguration({ missionId, bonusCoins });
    if (result.status === "not-found") return NextResponse.json({ message: "Mission not found." }, { status: 404 });
    if (result.status === "invalid-bonus") return NextResponse.json({ message: "Enter a valid bonus amount." }, { status: 400 });
    return NextResponse.json({ mission: result.mission });
  }

  if (payload.action === "set-status" && (payload.status === MissionStatus.Active || payload.status === MissionStatus.Inactive)) {
    const result = updateMissionConfiguration({ missionId, status: payload.status });
    if (result.status === "not-found") return NextResponse.json({ message: "Mission not found." }, { status: 404 });
    if (result.status === "invalid-bonus") return NextResponse.json({ message: "Enter a valid bonus amount." }, { status: 400 });
    return NextResponse.json({ mission: result.mission });
  }

  return NextResponse.json({ message: "Unsupported mission update." }, { status: 400 });
}