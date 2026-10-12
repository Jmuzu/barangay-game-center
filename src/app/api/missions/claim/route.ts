import { NextResponse } from "next/server";
import { getGameCenterSession } from "@code/auth/parentSession";
import { claimParentPlayerMission } from "@code/database/sqlite";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getGameCenterSession();
  if (!session) return NextResponse.json({ message: "Barangay Platform sign-in is required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }
  const missionId = body && typeof body === "object" && !Array.isArray(body)
    && typeof (body as Record<string, unknown>).missionId === "string"
    ? ((body as Record<string, string>).missionId).trim()
    : "";
  if (!missionId) return NextResponse.json({ message: "Mission ID is required." }, { status: 400 });

  const result = claimParentPlayerMission(session.user.id, missionId);
  if (result.status === "player-not-found") return NextResponse.json({ message: "Player profile was not found." }, { status: 403 });
  if (result.status === "not-found") return NextResponse.json({ message: "Mission not found." }, { status: 404 });
  if (result.status === "inactive") return NextResponse.json({ message: "This mission is not active." }, { status: 409 });
  if (result.status === "incomplete") return NextResponse.json({ message: "Mission requirements have not been met." }, { status: 409 });

  return NextResponse.json({
    status: result.status,
    wallet: result.wallet,
    claimedMissionIds: result.claimedMissionIds,
  });
}