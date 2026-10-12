import Database from "better-sqlite3";
import {
  applySandboxCoinConversionMigration,
  claimParentPlayerMission,
  createGameRegistration,
  consumeParentLaunch,
  listGameRegistrations,
  readParentPlayerState,
  readState,
  revealGameRegistrationCredentials,
  resetState,
  saveParentPlayerState,
  saveState,
  transferParentPlayerCoins,
  updateMissionConfiguration,
} from "@code/database/sqlite";
import { GameCategory, GameLaunchType, GameStatus, TransactionType } from "@shared/enums";

const registrationInput = {
  appName: "SQLite Test App",
  providerName: "Test Provider",
  description: "Test registration",
  launchUrl: "https://example.com/game",
  apiBaseUrl: "https://example.com/api",
  authEndpoint: "/auth",
  balanceEndpoint: "/balance",
  addChipsEndpoint: "/add-chips",
  deductChipsEndpoint: "/deduct-chips",
  credentialReference: "secret-manager/test",
  signatureAlgorithm: "HMAC-SHA256",
  externalUserIdField: "username",
  transactionIdField: "transId",
  transactionTypeField: "transactionType",
  gameTypeField: "gameType",
  requestIdField: "request_id",
  category: GameCategory.Community,
  costPerPlay: 0,
  launchType: GameLaunchType.ExternalUrl,
  status: GameStatus.Active,
  active: true,
};

describe("SQLite state repository", () => {
  afterEach(() => {
    resetState();
  });

  it("loads seeded state including the game catalog", () => {
    const state = readState();

    expect(state.profile.displayName).toBe("Juan Dela Cruz");
    expect(state.games).toEqual([]);
    expect(state.feed.length).toBeGreaterThan(0);
  });

  it("persists changes and restores seed data on reset", () => {
    const state = readState();
    saveState({ ...state, profile: { ...state.profile, displayName: "SQLite Player" } });

    expect(readState().profile.displayName).toBe("SQLite Player");
    expect(resetState().profile.displayName).toBe("Juan Dela Cruz");
  });

  it("corrects legacy sandbox purchase grants once and synchronizes the managed demo player", () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE app_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);
      CREATE TABLE app_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE coin_purchases (
        id TEXT PRIMARY KEY NOT NULL,
        player_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        coins INTEGER NOT NULL,
        status TEXT NOT NULL
      );
    `);
    const profile = {
      id: "player-demo-001",
      displayName: "Juan Dela Cruz",
      homeBarangay: "Barangay San Isidro",
    };
    const wallet = {
      balance: 722,
      transactions: [
        { id: "payment-one", type: "administrative-credit", amount: 10, reason: "₱1 package", createdAt: "2026-01-01", source: "paymongo-test:one" },
        { id: "payment-five", type: "administrative-credit", amount: 50, reason: "₱5 package", createdAt: "2026-01-01", source: "paymongo-test:five" },
      ],
    };
    const adminUsers = {
      users: [{ id: "user-001", displayName: profile.displayName, homeBarangay: profile.homeBarangay, coinBalance: 722 }],
      history: [],
    };
    const insertState = database.prepare("INSERT INTO app_state (key, value) VALUES (?, ?)");
    insertState.run("profile", JSON.stringify(profile));
    insertState.run("wallet", JSON.stringify(wallet));
    insertState.run("adminUsers", JSON.stringify(adminUsers));
    database.prepare("INSERT INTO coin_purchases VALUES (?, ?, ?, ?, ?)").run("paid-one", profile.id, 100, 10, "paid");
    database.prepare("INSERT INTO coin_purchases VALUES (?, ?, ?, ?, ?)").run("paid-five", profile.id, 500, 50, "paid");
    database.prepare("INSERT INTO coin_purchases VALUES (?, ?, ?, ?, ?)").run("pending-one", profile.id, 100, 10, "pending");

    try {
      applySandboxCoinConversionMigration(database);
      applySandboxCoinConversionMigration(database);

      const walletRow = database.prepare("SELECT value FROM app_state WHERE key = 'wallet'").get() as { value: string } | undefined;
      const adminUsersRow = database.prepare("SELECT value FROM app_state WHERE key = 'adminUsers'").get() as { value: string } | undefined;
      const correctedWallet = JSON.parse(walletRow!.value);
      const correctedAdminUsers = JSON.parse(adminUsersRow!.value);
      const purchases = database.prepare("SELECT id, coins FROM coin_purchases ORDER BY id").all();

      expect(correctedWallet.balance).toBe(668);
      expect(correctedWallet.transactions.filter((transaction: { source?: string }) => transaction.source === "paymongo-test-rate-correction:sandbox-coins-one-per-peso-v1")).toHaveLength(2);
      expect(correctedAdminUsers.users[0]).toMatchObject({ id: "user-001", coinBalance: 668 });
      expect(correctedAdminUsers.history).toHaveLength(2);
      expect(correctedAdminUsers.history.every((entry: { userId: string }) => entry.userId === "user-001")).toBe(true);
      expect(purchases).toEqual([
        { id: "paid-five", coins: 5 },
        { id: "paid-one", coins: 1 },
        { id: "pending-one", coins: 1 },
      ]);
    } finally {
      database.close();
    }
  });

  it("generates unique SHA-256 credentials and keeps secrets out of listings", () => {
    const first = createGameRegistration(registrationInput);
    const second = createGameRegistration(registrationInput);

    expect(first.appKey).toMatch(/^[a-f0-9]{64}$/);
    expect(second.appKey).toMatch(/^[a-f0-9]{64}$/);
    expect(second.appKey).not.toBe(first.appKey);
    expect(revealGameRegistrationCredentials(first.appKey)?.signingSecret).toMatch(/^[a-f0-9]{64}$/);
    expect(listGameRegistrations()).toEqual(expect.arrayContaining([
      expect.not.objectContaining({ signingSecret: expect.anything() }),
    ]));
  });

  it("provisions isolated zero-balance parent players and consumes each launch token once", () => {
    const firstUser = {
      id: "parent-user-1",
      displayName: "First Resident",
      homeBarangay: "Barangay One",
      barangayId: "brgy-001",
      role: "resident" as const,
      isActive: true,
    };
    const secondUser = { ...firstUser, id: "parent-user-2", displayName: "Second Resident" };

    expect(consumeParentLaunch(firstUser, "launch-once", "parent-session-1", Date.now() + 60_000)).toBe(true);
    expect(consumeParentLaunch(firstUser, "launch-once", "parent-session-1", Date.now() + 60_000)).toBe(false);
    expect(consumeParentLaunch(secondUser, "launch-second", "parent-session-2", Date.now() + 60_000)).toBe(true);

    const firstState = readParentPlayerState(firstUser.id)!;
    expect(firstState.profile).toMatchObject({ id: firstUser.id, displayName: firstUser.displayName, role: "player" });
    expect(firstState.wallet.balance).toBe(0);
    saveParentPlayerState(firstUser.id, { ...firstState, wallet: { ...firstState.wallet, balance: 7 } });
    expect(readParentPlayerState(firstUser.id)?.wallet.balance).toBe(7);
    expect(readParentPlayerState(secondUser.id)?.wallet.balance).toBe(0);
    expect(readState().profile.id).not.toBe(firstUser.id);

    const adminUser = { ...firstUser, id: "parent-admin-1", role: "admin" as const };
    consumeParentLaunch(adminUser, "launch-admin", "parent-session-admin", Date.now() + 60_000);
    expect(readParentPlayerState(adminUser.id)?.profile.role).toBe("super-admin");
  });

  it("transfers coins between parent players atomically and makes retries idempotent", () => {
    const sender = {
      id: "transfer-sender",
      displayName: "Sender",
      homeBarangay: "Barangay One",
      barangayId: "brgy-001",
      role: "resident" as const,
      isActive: true,
    };
    const recipient = { ...sender, id: "transfer-recipient", displayName: "Recipient" };
    consumeParentLaunch(sender, "transfer-launch-sender", "transfer-session-sender", Date.now() + 60_000);
    consumeParentLaunch(recipient, "transfer-launch-recipient", "transfer-session-recipient", Date.now() + 60_000);

    const senderState = readParentPlayerState(sender.id)!;
    const recipientState = readParentPlayerState(recipient.id)!;
    saveParentPlayerState(sender.id, { ...senderState, wallet: { ...senderState.wallet, balance: 60, dailyShareLimit: 50 } });
    saveParentPlayerState(recipient.id, { ...recipientState, wallet: { ...recipientState.wallet, balance: 5 } });
    const input = {
      requestId: "transfer-request-001",
      senderId: sender.id,
      recipientId: recipient.id,
      amount: 25,
      createdAt: "2026-10-09T12:00:00.000Z",
    };

    expect(transferParentPlayerCoins(input).status).toBe("transferred");
    expect(transferParentPlayerCoins(input).status).toBe("duplicate");
    expect(readParentPlayerState(sender.id)?.wallet).toMatchObject({ balance: 35, sharedToday: 25 });
    expect(readParentPlayerState(recipient.id)?.wallet).toMatchObject({ balance: 30 });
    expect(readParentPlayerState(sender.id)?.wallet.transactions).toHaveLength(1);
    expect(readParentPlayerState(recipient.id)?.wallet.transactions).toHaveLength(1);
  });

  it("shares mission configuration and claims eligible rewards only once", () => {
    const player = {
      id: "mission-player",
      displayName: "Mission Player",
      homeBarangay: "Barangay One",
      barangayId: "brgy-001",
      role: "resident" as const,
      isActive: true,
    };
    consumeParentLaunch(player, "mission-player-launch", "mission-player-session", Date.now() + 60_000);
    const playerState = readParentPlayerState(player.id)!;
    saveParentPlayerState(player.id, {
      ...playerState,
      wallet: {
        ...playerState.wallet,
        transactions: [{ id: "spend-1000", type: TransactionType.GameSpend, amount: 1000, reason: "Play", createdAt: "2026-10-01T10:00:00.000Z" }],
      },
    });

    expect(updateMissionConfiguration({ missionId: "mission-spend-1000", bonusCoins: 75 })).toMatchObject({
      status: "updated",
      mission: { bonusCoins: 75 },
    });
    expect(readState().missions.find((mission) => mission.id === "mission-spend-1000")?.bonusCoins).toBe(75);
    expect(claimParentPlayerMission(player.id, "mission-spend-1000")).toMatchObject({
      status: "claimed",
      wallet: { balance: 75 },
      claimedMissionIds: ["mission-spend-1000"],
    });
    expect(claimParentPlayerMission(player.id, "mission-spend-1000")).toMatchObject({
      status: "duplicate",
      wallet: { balance: 75 },
    });
    expect(readParentPlayerState(player.id)?.wallet.transactions.filter((transaction) => transaction.reason === "Mission completed: Big Spender I")).toHaveLength(1);
  });
});