/** @jest-environment node */

import { consumeParentLaunch, readParentPlayerState, readState, resetState, saveParentPlayerState } from "@code/database/sqlite";
import { getGameCenterSession } from "@code/auth/parentSession";
import { AuthorRole, TransactionType } from "@shared/enums";
import { PATCH } from "./route";
import { POST as claimMission } from "./claim/route";

jest.mock("@code/auth/parentSession", () => ({ getGameCenterSession: jest.fn() }));

const admin = {
  id: "mission-admin",
  displayName: "Barangay Admin",
  homeBarangay: "Barangay One",
  barangayId: "brgy-001",
  role: "admin" as const,
  isActive: true,
};
const player = { ...admin, id: "mission-player", displayName: "Player", role: "resident" as const };
const mockGetSession = jest.mocked(getGameCenterSession);

function apiRequest(url: string, body: Record<string, unknown>, method: string) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("missions APIs", () => {
  beforeEach(() => {
    resetState();
    consumeParentLaunch(admin, "mission-admin-launch", "mission-admin-session", Date.now() + 60_000);
    consumeParentLaunch(player, "mission-player-launch", "mission-player-session", Date.now() + 60_000);
    mockGetSession.mockResolvedValue({ id: "admin-session", user: admin, gameCenterRole: AuthorRole.BrgyAdmin });
  });

  afterEach(() => resetState());

  it("allows the parent platform admin mapped to BrgyAdmin to manage shared missions", async () => {
    const response = await PATCH(apiRequest("/api/missions", {
      action: "update-bonus",
      missionId: "mission-spend-1000",
      bonusCoins: 80,
    }, "PATCH"));

    expect(response.status).toBe(200);
    expect(readState().missions.find((mission) => mission.id === "mission-spend-1000")?.bonusCoins).toBe(80);
  });

  it("denies mission management to players", async () => {
    mockGetSession.mockResolvedValueOnce({ id: "player-session", user: player, gameCenterRole: AuthorRole.Player });
    const response = await PATCH(apiRequest("/api/missions", {
      action: "set-status",
      missionId: "mission-spend-1000",
      status: "inactive",
    }, "PATCH"));

    expect(response.status).toBe(403);
    expect(readState().missions.find((mission) => mission.id === "mission-spend-1000")?.status).toBe("active");
  });

  it("validates mission completion and credits an eligible reward once", async () => {
    const state = readParentPlayerState(player.id)!;
    saveParentPlayerState(player.id, {
      ...state,
      wallet: {
        ...state.wallet,
        transactions: [{ id: "spend-target", type: TransactionType.GameSpend, amount: 1000, reason: "Game spend", createdAt: new Date().toISOString() }],
      },
    });
    await PATCH(apiRequest("/api/missions", {
      action: "update-bonus",
      missionId: "mission-spend-1000",
      bonusCoins: 80,
    }, "PATCH"));

    mockGetSession.mockResolvedValue({ id: "player-session", user: player, gameCenterRole: AuthorRole.Player });
    const claim = () => claimMission(apiRequest("/api/missions/claim", { missionId: "mission-spend-1000" }, "POST"));
    const first = await claim();
    const duplicate = await claim();

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).status).toBe("duplicate");
    expect(readParentPlayerState(player.id)?.wallet.balance).toBe(80);
  });
});