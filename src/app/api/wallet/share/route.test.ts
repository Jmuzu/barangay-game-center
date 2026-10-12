/** @jest-environment node */

import { consumeParentLaunch, readParentPlayerState, resetState, saveParentPlayerState } from "@code/database/sqlite";
import { getGameCenterSession } from "@code/auth/parentSession";
import { AuthorRole } from "@shared/enums";
import { GET, POST } from "./route";

jest.mock("@code/auth/parentSession", () => ({ getGameCenterSession: jest.fn() }));

const sender = {
  id: "share-sender",
  displayName: "Sender Player",
  homeBarangay: "Barangay One",
  barangayId: "brgy-001",
  role: "resident" as const,
  isActive: true,
};
const recipient = { ...sender, id: "share-recipient", displayName: "Recipient Player" };
const mockGetSession = jest.mocked(getGameCenterSession);

function request(body: Record<string, unknown>, requestId = "share-request-001") {
  return new Request("http://localhost/api/wallet/share", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": requestId },
    body: JSON.stringify(body),
  });
}

describe("parent player coin sharing API", () => {
  beforeEach(() => {
    resetState();
    mockGetSession.mockResolvedValue({ id: "sender-session", user: sender, gameCenterRole: AuthorRole.Player });
    consumeParentLaunch(sender, "share-launch-sender", "sender-session", Date.now() + 60_000);
    consumeParentLaunch(recipient, "share-launch-recipient", "recipient-session", Date.now() + 60_000);
    const otherBarangay = { ...sender, id: "share-other-barangay", homeBarangay: "Barangay Two", barangayId: "brgy-002" };
    consumeParentLaunch(otherBarangay, "share-launch-other-barangay", "other-barangay-session", Date.now() + 60_000);
    const senderState = readParentPlayerState(sender.id)!;
    const recipientState = readParentPlayerState(recipient.id)!;
    saveParentPlayerState(sender.id, { ...senderState, wallet: { ...senderState.wallet, balance: 50, dailyShareLimit: 40 } });
    saveParentPlayerState(recipient.id, { ...recipientState, wallet: { ...recipientState.wallet, balance: 10 } });
  });

  afterEach(() => resetState());

  it("lists eligible players and transfers coins once to the selected player", async () => {
    const recipients = await GET();
    expect(await recipients.json()).toEqual([{ id: recipient.id, displayName: recipient.displayName }]);

    const body = { recipientId: recipient.id, amount: 15, note: "Thanks" };
    const first = await POST(request(body));
    const retry = await POST(request(body));

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect((await retry.json()).status).toBe("duplicate");
    expect(readParentPlayerState(sender.id)?.wallet.balance).toBe(35);
    expect(readParentPlayerState(recipient.id)?.wallet.balance).toBe(25);
  });

  it("rejects transfers that exceed the sender's balance or daily limit", async () => {
    const overLimit = await POST(request({ recipientId: recipient.id, amount: 45 }));
    expect(overLimit.status).toBe(409);
    expect(readParentPlayerState(sender.id)?.wallet.balance).toBe(50);
    expect(readParentPlayerState(recipient.id)?.wallet.balance).toBe(10);
  });

  it("hides and rejects recipients from another barangay", async () => {
    const recipients = await GET();
    expect(await recipients.json()).toEqual([{ id: recipient.id, displayName: recipient.displayName }]);

    const response = await POST(request({ recipientId: "share-other-barangay", amount: 5 }, "cross-barangay-request"));
    expect(response.status).toBe(403);
    expect(readParentPlayerState(sender.id)?.wallet.balance).toBe(50);
    expect(readParentPlayerState("share-other-barangay")?.wallet.balance).toBe(0);
  });

  it("requires a player session", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const response = await POST(request({ recipientId: recipient.id, amount: 5 }));
    expect(response.status).toBe(401);
  });
});