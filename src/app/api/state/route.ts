import { NextResponse } from "next/server";
import { readParentPlayerState, resetParentPlayerState, saveParentPlayerState } from "@code/database/sqlite";
import { getGameCenterSession } from "@code/auth/parentSession";

export const runtime = "nodejs";

export async function GET() {
  const session = await getGameCenterSession();
  if (!session) return NextResponse.json({ message: "Barangay Platform sign-in is required." }, { status: 401 });
  const state = readParentPlayerState(session.user.id);
  if (!state) return NextResponse.json({ message: "Game Center player profile is not provisioned." }, { status: 403 });
  const managedUser = state.adminUsers.users.find((user) => user.id === session.user.id);
  const safeState = {
    ...state,
    profile: {
      ...state.profile,
      id: session.user.id,
      displayName: session.user.displayName,
      homeBarangay: session.user.homeBarangay,
      role: session.gameCenterRole,
    },
    adminUsers: {
      ...state.adminUsers,
      users: managedUser ? [{
        ...managedUser,
        id: session.user.id,
        displayName: session.user.displayName,
        homeBarangay: session.user.homeBarangay,
        role: session.gameCenterRole,
        coinBalance: state.wallet.balance,
      }] : [],
    },
  };
  return NextResponse.json(safeState, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const session = await getGameCenterSession();
  if (!session) return NextResponse.json({ message: "Barangay Platform sign-in is required." }, { status: 401 });
  const state = await request.json();
  if (state?.profile?.id !== session.user.id) return NextResponse.json({ message: "Player identity mismatch." }, { status: 403 });
  const player = state.adminUsers?.users?.find((user: { id?: string }) => user.id === session.user.id);
  const safeState = {
    ...state,
    profile: {
      ...state.profile,
      id: session.user.id,
      displayName: session.user.displayName,
      homeBarangay: session.user.homeBarangay,
      role: session.gameCenterRole,
    },
    adminUsers: {
      users: player ? [{ ...player, id: session.user.id, displayName: session.user.displayName, homeBarangay: session.user.homeBarangay, role: session.gameCenterRole, coinBalance: state.wallet?.balance ?? 0 }] : [],
      history: (state.adminUsers?.history ?? []).filter((entry: { userId?: string }) => entry.userId === session.user.id),
    },
  };
  saveParentPlayerState(session.user.id, safeState);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getGameCenterSession();
  if (!session) return NextResponse.json({ message: "Barangay Platform sign-in is required." }, { status: 401 });
  return NextResponse.json(resetParentPlayerState(session.user));
}