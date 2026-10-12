/** @jest-environment node */

import { consumeParentLaunch, readParentPlayerState, resetState, saveParentPlayerState } from "@code/database/sqlite";
import { getGameCenterSession } from "@code/auth/parentSession";
import { AuthorRole } from "@shared/enums";
import { GET, PUT } from "./route";

jest.mock("@code/auth/parentSession", () => ({
  getGameCenterSession: jest.fn(),
}));

const parentUser = {
  id: "parent-state-user",
  displayName: "Parent User",
  homeBarangay: "Barangay One",
  barangayId: "brgy-001",
  role: "resident" as const,
  isActive: true,
};

const mockGetGameCenterSession = jest.mocked(getGameCenterSession);

describe("parent-scoped Game Center state API", () => {
  beforeEach(() => {
    resetState();
    mockGetGameCenterSession.mockResolvedValue({
      id: "parent-session",
      user: parentUser,
      gameCenterRole: AuthorRole.Player,
    });
    consumeParentLaunch(parentUser, "state-test-launch", "parent-session", Math.floor(Date.now() / 1000) + 60);
  });

  afterEach(() => resetState());

  it("rejects state access without an active parent session", async () => {
    mockGetGameCenterSession.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("rejects a state payload claiming another parent identity", async () => {
    const response = await PUT(new Request("http://localhost/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: { id: "another-parent" }, wallet: { balance: 999 } }),
    }));

    expect(response.status).toBe(403);
    expect(readParentPlayerState(parentUser.id)?.wallet.balance).toBe(0);
  });

  it("clamps writable identity and role to the parent session", async () => {
    const state = readParentPlayerState(parentUser.id)!;
    const response = await PUT(new Request("http://localhost/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...state,
        profile: { ...state.profile, id: parentUser.id, displayName: "Spoofed Name", role: "super-admin" },
      }),
    }));

    expect(response.status).toBe(200);
    expect(readParentPlayerState(parentUser.id)?.profile).toMatchObject({
      id: parentUser.id,
      displayName: parentUser.displayName,
      role: "player",
    });
  });

  it("returns the current SuperAdmin role for parent admin sessions on existing profiles", async () => {
    const adminUser = { ...parentUser, id: "existing-parent-admin", role: "admin" as const };
    consumeParentLaunch(adminUser, "existing-admin-launch", "admin-session", Math.floor(Date.now() / 1000) + 60);
    const existingState = readParentPlayerState(adminUser.id)!;
    saveParentPlayerState(adminUser.id, {
      ...existingState,
      profile: { ...existingState.profile, role: AuthorRole.BrgyAdmin },
      adminUsers: {
        ...existingState.adminUsers,
        users: existingState.adminUsers.users.map((user) => ({ ...user, role: AuthorRole.BrgyAdmin })),
      },
    });
    mockGetGameCenterSession.mockResolvedValueOnce({
      id: "admin-session",
      user: adminUser,
      gameCenterRole: AuthorRole.SuperAdmin,
    });

    const response = await GET();
    const state = await response.json();

    expect(state.profile.role).toBe(AuthorRole.SuperAdmin);
    expect(state.adminUsers.users[0].role).toBe(AuthorRole.SuperAdmin);
  });
});