import { NextResponse } from "next/server";
import { getGameCenterSession } from "@code/auth/parentSession";
import { readParentPlayerState, readParentPlayerUserIds, transferParentPlayerCoins } from "@code/database/sqlite";
import { AuthorRole, UserStatus } from "@shared/enums";

export const runtime = "nodejs";

export async function GET() {
  const session = await getGameCenterSession();
  if (!session) return NextResponse.json({ message: "Barangay Platform sign-in is required." }, { status: 401 });

  const recipients = readParentPlayerUserIds()
    .filter((userId) => userId !== session.user.id)
    .flatMap((userId) => {
      const state = readParentPlayerState(userId);
      const user = state?.adminUsers.users.find((candidate) => candidate.id === userId);
      if (!state || state.profile.homeBarangay !== session.user.homeBarangay
        || !user || user.status !== UserStatus.Active || user.role !== AuthorRole.Player) return [];
      return [{ id: userId, displayName: state.profile.displayName }];
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  return NextResponse.json(recipients, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await getGameCenterSession();
  if (!session) return NextResponse.json({ message: "Barangay Platform sign-in is required." }, { status: 401 });
  if (session.gameCenterRole !== AuthorRole.Player) {
    return NextResponse.json({ message: "Only player accounts can share coins." }, { status: 403 });
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
  const recipientId = typeof payload.recipientId === "string" ? payload.recipientId.trim() : "";
  const amount = payload.amount;
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const requestId = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!recipientId || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
    return NextResponse.json({ message: "Choose a recipient and enter a positive whole-number amount." }, { status: 400 });
  }
  if (note.length > 140) return NextResponse.json({ message: "Notes must be 140 characters or fewer." }, { status: 400 });
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId)) {
    return NextResponse.json({ message: "A valid idempotency key is required." }, { status: 400 });
  }

  const result = transferParentPlayerCoins({
    requestId,
    senderId: session.user.id,
    recipientId,
    amount,
    note,
    createdAt: new Date().toISOString(),
  });
  const errors: Record<string, { message: string; status: number }> = {
    "idempotency-conflict": { message: "This transfer request key was already used for different details.", status: 409 },
    "invalid-amount": { message: "Enter a positive whole-number amount.", status: 400 },
    "self-transfer": { message: "You cannot share coins with yourself.", status: 400 },
    "sender-not-found": { message: "Player account was not found.", status: 404 },
    "recipient-not-found": { message: "Choose an active player account.", status: 404 },
    "recipient-inactive": { message: "This player cannot receive coins.", status: 409 },
    "recipient-out-of-scope": { message: "Coins can only be shared with a player in your home barangay.", status: 403 },
    "insufficient-balance": { message: "You do not have enough coins for this transfer.", status: 409 },
    "daily-limit-exceeded": { message: "This transfer exceeds your remaining daily sharing limit.", status: 409 },
  };
  const error = errors[result.status];
  if (error) return NextResponse.json({ message: error.message }, { status: error.status });

  return NextResponse.json({ status: result.status, wallet: result.senderWallet }, { status: result.status === "duplicate" ? 200 : 201 });
}