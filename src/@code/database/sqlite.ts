import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { RootState } from "@code/state/store";
import { AuthorRole, CoinAdjustmentType, MissionStatus, TransactionType, UserStatus } from "@shared/enums";
import type { CoinPackage, GameRegistration, GameRegistrationInput, Mission, ProviderTransaction, WalletState } from "@shared/types";
import { encryptProviderSecret, decryptProviderSecret } from "./providerSecurity";
import type { ParentGameIdentity } from "@code/auth/parentSession";
import { isSameCalendarDay } from "@shared/utils";
import { getMissionProgressTarget, getMissionProgressValue } from "@shared/helpers";

type PersistedKey = keyof RootState;
type PersistedState = RootState;

function parentRoleToGameCenterRole(role: ParentGameIdentity["role"]): AuthorRole {
  if (role === "admin" || role === "super_admin") return AuthorRole.SuperAdmin;
  return AuthorRole.Player;
}

function createParentPlayerState(user: ParentGameIdentity): PersistedState {
  const demoState = readState();
  const role = parentRoleToGameCenterRole(user.role);
  const managedUser = {
    id: user.id,
    displayName: user.displayName,
    avatarEmoji: "👤",
    homeBarangay: user.homeBarangay,
    role,
    status: UserStatus.Active,
    coinBalance: 0,
  };
  return {
    ...demoState,
    profile: {
      ...demoState.profile,
      id: user.id,
      displayName: user.displayName,
      avatarEmoji: managedUser.avatarEmoji,
      homeBarangay: user.homeBarangay,
      bio: "",
      role,
    },
    wallet: { ...demoState.wallet, balance: 0, transactions: [], sharedToday: 0, lastShareDate: null },
    adminUsers: { users: [managedUser], history: [] },
    playerMissions: { claimedMissionIds: [] },
    streak: { currentStreak: 0, longestStreak: 0, lastPlayedDate: null, claimedMilestoneDays: [] },
  };
}

export function consumeParentLaunch(
  user: ParentGameIdentity,
  launchId: string,
  parentSessionId: string,
  expiresAt: number,
): boolean {
  const db = getDatabase();
  return db.transaction(() => {
    const launchInsert = db.prepare(`
      INSERT OR IGNORE INTO consumed_parent_launches (launch_id, parent_user_id, parent_session_id, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(launchId, user.id, parentSessionId, expiresAt, new Date().toISOString());
    if (launchInsert.changes !== 1) return false;

    const existing = db.prepare("SELECT parent_user_id FROM game_center_user_states WHERE parent_user_id = ?").get(user.id);
    if (!existing) {
      db.prepare("INSERT INTO game_center_user_states (parent_user_id, state_json) VALUES (?, ?)")
        .run(user.id, JSON.stringify(createParentPlayerState(user)));
    }
    return true;
  })();
}

export function readParentPlayerState(parentUserId: string): PersistedState | null {
  const row = getDatabase().prepare("SELECT state_json FROM game_center_user_states WHERE parent_user_id = ?")
    .get(parentUserId) as { state_json: string } | undefined;
  if (row) return JSON.parse(row.state_json) as PersistedState;
  const demoState = readState();
  if (demoState?.profile?.id === parentUserId) return demoState;
  return null;
}

export function readParentPlayerUserIds(): string[] {
  return (getDatabase().prepare("SELECT parent_user_id FROM game_center_user_states ORDER BY parent_user_id").all() as Array<{ parent_user_id: string }>)
    .map((row) => row.parent_user_id);
}

export function readGameCenterPlayerState(parentUserId: string): PersistedState | null {
  return readParentPlayerState(parentUserId);
}

export function saveParentPlayerState(parentUserId: string, state: PersistedState): void {
  if (state.profile.id !== parentUserId) throw new Error("Parent player state identity mismatch.");
  getDatabase().prepare(`
    INSERT INTO game_center_user_states (parent_user_id, state_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(parent_user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP
  `).run(parentUserId, JSON.stringify(state));
}

export function resetParentPlayerState(user: ParentGameIdentity): PersistedState {
  const state = createParentPlayerState(user);
  saveParentPlayerState(user.id, state);
  return state;
}

export type CoinTransferResult = {
  status: "transferred" | "duplicate" | "idempotency-conflict" | "invalid-amount" | "self-transfer"
    | "sender-not-found" | "recipient-not-found" | "recipient-inactive" | "recipient-out-of-scope" | "insufficient-balance" | "daily-limit-exceeded";
  senderWallet?: WalletState;
}

export function transferParentPlayerCoins(input: {
  requestId: string;
  senderId: string;
  recipientId: string;
  amount: number;
  note?: string;
  createdAt: string;
}): CoinTransferResult {
  const db = getDatabase();
  return db.transaction((): CoinTransferResult => {
    const existing = db.prepare("SELECT sender_id, recipient_id, amount FROM coin_transfers WHERE request_id = ?")
      .get(input.requestId) as { sender_id: string; recipient_id: string; amount: number } | undefined;
    if (existing) {
      if (existing.sender_id !== input.senderId || existing.recipient_id !== input.recipientId || existing.amount !== input.amount) {
        return { status: "idempotency-conflict" };
      }
      const sender = readParentPlayerState(input.senderId);
      return sender ? { status: "duplicate", senderWallet: sender.wallet } : { status: "sender-not-found" };
    }
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return { status: "invalid-amount" };
    if (input.senderId === input.recipientId) return { status: "self-transfer" };

    const sender = readParentPlayerState(input.senderId);
    if (!sender) return { status: "sender-not-found" };
    const recipient = readParentPlayerState(input.recipientId);
    if (!recipient) return { status: "recipient-not-found" };
    if (recipient.profile.homeBarangay !== sender.profile.homeBarangay) return { status: "recipient-out-of-scope" };
    const recipientAccount = recipient.adminUsers.users.find((user) => user.id === input.recipientId);
    if (!recipientAccount || recipientAccount.status !== UserStatus.Active) return { status: "recipient-inactive" };

    const sharedToday = sender.wallet.lastShareDate && isSameCalendarDay(sender.wallet.lastShareDate, input.createdAt)
      ? sender.wallet.sharedToday
      : 0;
    if (input.amount > sender.wallet.balance) return { status: "insufficient-balance" };
    if (input.amount > sender.wallet.dailyShareLimit - sharedToday) return { status: "daily-limit-exceeded" };

    const senderName = sender.profile.displayName;
    const recipientName = recipient.profile.displayName;
    const note = input.note?.trim();
    const transferId = `share-${input.requestId}`;
    const senderWallet: WalletState = {
      ...sender.wallet,
      balance: sender.wallet.balance - input.amount,
      sharedToday: sharedToday + input.amount,
      lastShareDate: input.createdAt,
      transactions: [{
        id: transferId,
        type: TransactionType.ShareSent,
        amount: input.amount,
        reason: note || `Shared with ${recipientName}`,
        createdAt: input.createdAt,
        counterpartyName: recipientName,
      }, ...sender.wallet.transactions],
    };
    const recipientWallet: WalletState = {
      ...recipient.wallet,
      balance: recipient.wallet.balance + input.amount,
      transactions: [{
        id: transferId,
        type: TransactionType.ShareReceived,
        amount: input.amount,
        reason: note || `Received from ${senderName}`,
        createdAt: input.createdAt,
        counterpartyName: senderName,
      }, ...recipient.wallet.transactions],
    };
    const updateState = db.prepare(`
      UPDATE game_center_user_states SET state_json = ?, updated_at = CURRENT_TIMESTAMP WHERE parent_user_id = ?
    `);
    updateState.run(JSON.stringify({
      ...sender,
      wallet: senderWallet,
      adminUsers: {
        ...sender.adminUsers,
        users: sender.adminUsers.users.map((user) => user.id === input.senderId
          ? { ...user, coinBalance: senderWallet.balance }
          : user),
      },
    }), input.senderId);
    updateState.run(JSON.stringify({
      ...recipient,
      wallet: recipientWallet,
      adminUsers: {
        ...recipient.adminUsers,
        users: recipient.adminUsers.users.map((user) => user.id === input.recipientId
          ? { ...user, coinBalance: recipientWallet.balance }
          : user),
      },
    }), input.recipientId);
    db.prepare("INSERT INTO coin_transfers (request_id, sender_id, recipient_id, amount, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(input.requestId, input.senderId, input.recipientId, input.amount, input.createdAt);
    return { status: "transferred", senderWallet };
  })();
}

export type MissionUpdateResult = { status: "updated"; mission: Mission } | { status: "not-found" } | { status: "invalid-bonus" };

export function updateMissionConfiguration(input: {
  missionId: string;
  bonusCoins?: number;
  status?: MissionStatus;
}): MissionUpdateResult {
  const db = getDatabase();
  return db.transaction((): MissionUpdateResult => {
    const row = db.prepare("SELECT value FROM app_state WHERE key = 'missions'").get() as { value: string } | undefined;
    const missions = row ? JSON.parse(row.value) as Mission[] : [];
    const mission = missions.find((candidate) => candidate.id === input.missionId);
    if (!mission) return { status: "not-found" };
    if (input.bonusCoins !== undefined) {
      if (!Number.isSafeInteger(input.bonusCoins) || input.bonusCoins <= 0) return { status: "invalid-bonus" };
      mission.bonusCoins = input.bonusCoins;
    }
    if (input.status !== undefined) mission.status = input.status;
    db.prepare("UPDATE app_state SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'missions'")
      .run(JSON.stringify(missions));
    return { status: "updated", mission };
  })();
}

export type MissionClaimResult = {
  status: "claimed" | "duplicate" | "not-found" | "inactive" | "incomplete" | "player-not-found";
  wallet?: WalletState;
  claimedMissionIds?: string[];
}

export function claimParentPlayerMission(parentUserId: string, missionId: string): MissionClaimResult {
  const db = getDatabase();
  return db.transaction((): MissionClaimResult => {
    const stateRow = db.prepare("SELECT state_json FROM game_center_user_states WHERE parent_user_id = ?")
      .get(parentUserId) as { state_json: string } | undefined;
    if (!stateRow) return { status: "player-not-found" };
    const state = JSON.parse(stateRow.state_json) as PersistedState;
    const catalogRow = db.prepare("SELECT value FROM app_state WHERE key = 'missions'").get() as { value: string } | undefined;
    const missions = catalogRow ? JSON.parse(catalogRow.value) as Mission[] : [];
    const mission = missions.find((candidate) => candidate.id === missionId);
    if (!mission) return { status: "not-found" };

    const claimedMissionIds = state.playerMissions.claimedMissionIds;
    if (claimedMissionIds.includes(missionId)) return { status: "duplicate", wallet: state.wallet, claimedMissionIds };
    if (mission.status !== MissionStatus.Active) return { status: "inactive" };

    const progressTarget = getMissionProgressTarget(mission.id);
    const lifetimeCoinsSpent = state.wallet.transactions
      .filter((transaction) => transaction.type === TransactionType.GameSpend)
      .reduce((total, transaction) => total + transaction.amount, 0);
    const progress = getMissionProgressValue(mission.id, {
      streakDays: state.streak.currentStreak,
      lifetimeCoinsSpent,
    });
    if (progressTarget !== null && progress < progressTarget) return { status: "incomplete" };

    const createdAt = new Date().toISOString();
    const transactionId = `mission-${randomUUID()}`;
    const wallet: WalletState = {
      ...state.wallet,
      balance: state.wallet.balance + mission.bonusCoins,
      transactions: [{
        id: transactionId,
        type: TransactionType.AdministrativeCredit,
        amount: mission.bonusCoins,
        reason: `Mission completed: ${mission.title}`,
        createdAt,
      }, ...state.wallet.transactions],
    };
    const nextClaimedMissionIds = [...claimedMissionIds, missionId];
    const adminUsers = {
      ...state.adminUsers,
      users: state.adminUsers.users.map((user) => user.id === parentUserId
        ? { ...user, coinBalance: wallet.balance }
        : user),
    };
    db.prepare("UPDATE game_center_user_states SET state_json = ?, updated_at = CURRENT_TIMESTAMP WHERE parent_user_id = ?")
      .run(JSON.stringify({
        ...state,
        wallet,
        adminUsers,
        playerMissions: { ...state.playerMissions, claimedMissionIds: nextClaimedMissionIds },
      }), parentUserId);
    return { status: "claimed", wallet, claimedMissionIds: nextClaimedMissionIds };
  })();
}

export interface CoinPurchase {
  id: string;
  referenceNumber: string;
  playerId: string;
  packageId: string;
  amountMinor: number;
  coins: number;
  currency: string;
  status: "pending" | "paid" | "failed";
  checkoutSessionId: string | null;
  checkoutUrl: string | null;
  paymentId: string | null;
  paidAt: string | null;
  createdAt: string;
}

type CoinPurchaseRow = {
  id: string;
  reference_number: string;
  player_id: string;
  package_id: string;
  amount_minor: number;
  coins: number;
  currency: string;
  status: CoinPurchase["status"];
  checkout_session_id: string | null;
  checkout_url: string | null;
  payment_id: string | null;
  paid_at: string | null;
  created_at: string;
};

function mapCoinPurchase(row: CoinPurchaseRow): CoinPurchase {
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    playerId: row.player_id,
    packageId: row.package_id,
    amountMinor: row.amount_minor,
    coins: row.coins,
    currency: row.currency,
    status: row.status,
    checkoutSessionId: row.checkout_session_id,
    checkoutUrl: row.checkout_url,
    paymentId: row.payment_id,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

function findManagedProfileRecord(adminUsers: Record<string, any>, profile: Record<string, any>) {
  const users = Array.isArray(adminUsers.users) ? adminUsers.users : [];
  return users.find((user: Record<string, any>) => user.id === profile.id)
    ?? users.find((user: Record<string, any>) =>
      user.displayName === profile.displayName && user.homeBarangay === profile.homeBarangay,
    );
}

  export function applySandboxCoinConversionMigration(db: Database.Database): void {
    const migrationName = "sandbox-coins-one-per-peso-v1";
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_migrations (
        name TEXT PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    if (db.prepare("SELECT name FROM app_migrations WHERE name = ?").get(migrationName)) return;

    const stateRows = db.prepare("SELECT key, value FROM app_state WHERE key IN ('profile', 'wallet', 'adminUsers')").all() as Array<{ key: string; value: string }>;
    const stateByKey = new Map(stateRows.map((row) => [row.key, JSON.parse(row.value) as Record<string, any>]));
    const profile = stateByKey.get("profile");
    const wallet = stateByKey.get("wallet");
    const adminUsers = stateByKey.get("adminUsers");
    if (!profile || !wallet || !adminUsers) return;

    const purchases = db.prepare("SELECT id, player_id, amount_minor, coins, status FROM coin_purchases").all() as Array<{
      id: string;
      player_id: string;
      amount_minor: number;
      coins: number;
      status: CoinPurchase["status"];
    }>;
    const paidProfilePurchases = purchases.filter((purchase) => purchase.status === "paid" && purchase.player_id === profile.id);
    const purchaseUpdates = purchases
      .filter((purchase) => purchase.amount_minor % 100 === 0)
      .map((purchase) => ({ ...purchase, correctedCoins: purchase.amount_minor / 100 }))
      .filter((purchase) => purchase.correctedCoins !== purchase.coins);

    const corrections = paidProfilePurchases
      .map((purchase) => ({ ...purchase, correctedCoins: purchase.amount_minor % 100 === 0 ? purchase.amount_minor / 100 : purchase.coins }))
      .map((purchase) => ({ ...purchase, delta: purchase.correctedCoins - purchase.coins }))
      .filter((purchase) => purchase.delta !== 0);

    let nextBalance = Number(wallet.balance);
    const correctionTransactions: Array<Record<string, unknown>> = [];
    const managedProfile = findManagedProfileRecord(adminUsers, profile);
    const historyUserId = managedProfile?.id ?? profile.id;
    const now = new Date().toISOString();

    for (const correction of corrections) {
      const appliedDelta = correction.delta < 0
        ? Math.max(-nextBalance, correction.delta)
        : correction.delta;
      if (appliedDelta === 0) continue;
      const amount = Math.abs(appliedDelta);
      const adjustmentType = appliedDelta < 0 ? CoinAdjustmentType.Debit : CoinAdjustmentType.Credit;
      const id = `coin-rate-correction-${correction.id}`;
      const reason = `Sandbox coin conversion correction: ${correction.amount_minor / 100} PHP = ${correction.correctedCoins} coins`;
      correctionTransactions.push({
        id,
        type: appliedDelta < 0 ? TransactionType.AdministrativeDebit : TransactionType.AdministrativeCredit,
        amount,
        reason,
        createdAt: now,
        source: `paymongo-test-rate-correction:${migrationName}`,
      });
      adminUsers.history = [
        {
          id,
          userId: historyUserId,
          userName: managedProfile?.displayName ?? profile.displayName,
          adjustmentType,
          amount,
          reason,
          adminName: "PayMongo Sandbox Conversion",
          createdAt: now,
        },
        ...(adminUsers.history ?? []),
      ];
      nextBalance += appliedDelta;
    }

    const transaction = db.transaction(() => {
      const updatePurchase = db.prepare("UPDATE coin_purchases SET coins = ? WHERE id = ?");
      for (const purchase of purchaseUpdates) updatePurchase.run(purchase.correctedCoins, purchase.id);

      if (correctionTransactions.length > 0) {
        wallet.balance = nextBalance;
        wallet.transactions = [...correctionTransactions, ...(wallet.transactions ?? [])];
      }
      if (managedProfile) {
        adminUsers.users = (adminUsers.users ?? []).map((user: { id: string; coinBalance: number }) =>
          user.id === managedProfile.id ? { ...user, coinBalance: nextBalance } : user,
        );
        adminUsers.history = (adminUsers.history ?? []).map((entry: { userId: string; userName: string }) =>
          entry.userId === profile.id
            ? { ...entry, userId: managedProfile.id, userName: managedProfile.displayName }
            : entry,
        );
      }

      const upsertState = db.prepare(`
        INSERT INTO app_state (key, value, updated_at)
        VALUES (@key, @value, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);
      if (correctionTransactions.length > 0) {
        upsertState.run({ key: "wallet", value: JSON.stringify(wallet) });
        upsertState.run({ key: "adminUsers", value: JSON.stringify(adminUsers) });
      } else if (managedProfile) {
        upsertState.run({ key: "adminUsers", value: JSON.stringify(adminUsers) });
      }
      db.prepare("INSERT INTO app_migrations (name, applied_at) VALUES (?, ?)").run(migrationName, now);
    });
    transaction();
  }

const DATABASE_DIRECTORY = path.join(process.cwd(), "src", "@code", "database");
const DATABASE_FILE = process.env.NODE_ENV === "test" ? "game-center.test.sqlite" : "game-center.sqlite";
const DATABASE_PATH = path.join(DATABASE_DIRECTORY, DATABASE_FILE);
const SEED_PATH = path.join(DATABASE_DIRECTORY, "seed.sql");
const STATE_KEYS: PersistedKey[] = ["profile", "wallet", "games", "feed", "adminUsers", "missions", "streak", "playerMissions"];

let database: Database.Database | null = null;

function seedDatabase(): void {
  if (!database) throw new Error("SQLite database is not initialized");
  database.exec(fs.readFileSync(SEED_PATH, "utf8"));
}

function writeState(state: PersistedState): void {
  if (!database) throw new Error("SQLite database is not initialized");
  const insert = database.prepare(`
    INSERT INTO app_state (key, value, updated_at)
    VALUES (@key, @value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  database.transaction((nextState: PersistedState) => {
    for (const key of STATE_KEYS) insert.run({ key, value: JSON.stringify(nextState[key]) });
  })(state);
}

function getDatabase(): Database.Database {
  if (database) return database;
  fs.mkdirSync(DATABASE_DIRECTORY, { recursive: true });
  database = new Database(DATABASE_PATH);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS game_registrations (
      id TEXT PRIMARY KEY NOT NULL,
      app_key TEXT COLLATE NOCASE UNIQUE NOT NULL,
      app_name TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      description TEXT NOT NULL,
      launch_url TEXT NOT NULL,
      api_base_url TEXT NOT NULL,
      auth_endpoint TEXT NOT NULL,
      balance_endpoint TEXT NOT NULL DEFAULT '/balance',
      add_chips_endpoint TEXT NOT NULL,
      deduct_chips_endpoint TEXT NOT NULL,
      credential_reference TEXT NOT NULL,
      signature_algorithm TEXT NOT NULL,
      external_user_id_field TEXT NOT NULL,
      transaction_id_field TEXT NOT NULL,
      transaction_type_field TEXT NOT NULL,
      game_type_field TEXT NOT NULL,
      request_id_field TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'community',
      cost_per_play INTEGER NOT NULL DEFAULT 0,
      launch_type TEXT NOT NULL DEFAULT 'external-url',
      status TEXT NOT NULL DEFAULT 'active',
      active INTEGER NOT NULL DEFAULT 1,
      signing_secret_ciphertext TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);
  const registrationColumns = database.prepare("PRAGMA table_info(game_registrations)").all() as Array<{ name: string }>;
  const existingColumns = new Set(registrationColumns.map((column) => column.name));
  const migrations = [
    ["category", "TEXT NOT NULL DEFAULT 'community'"],
    ["cost_per_play", "INTEGER NOT NULL DEFAULT 0"],
    ["launch_type", "TEXT NOT NULL DEFAULT 'external-url'"],
    ["status", "TEXT NOT NULL DEFAULT 'active'"],
    ["active", "INTEGER NOT NULL DEFAULT 1"],
    ["balance_endpoint", "TEXT NOT NULL DEFAULT '/balance'"],
    ["signing_secret_ciphertext", "TEXT NOT NULL DEFAULT ''"],
  ] as const;
  for (const [name, definition] of migrations) {
    if (!existingColumns.has(name)) database.exec(`ALTER TABLE game_registrations ADD COLUMN ${name} ${definition}`);
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS provider_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      registration_id TEXT NOT NULL,
      app_key TEXT NOT NULL,
      external_user_id TEXT NOT NULL,
      external_transaction_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      round_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      game_type TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      signature TEXT NOT NULL,
      raw_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(registration_id, external_transaction_id, direction)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS coin_purchases (
      id TEXT PRIMARY KEY NOT NULL,
      reference_number TEXT UNIQUE NOT NULL,
      player_id TEXT NOT NULL,
      package_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      coins INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      checkout_session_id TEXT UNIQUE,
      checkout_url TEXT,
      payment_id TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS coin_purchase_webhook_events (
      event_id TEXT PRIMARY KEY NOT NULL,
      purchase_id TEXT NOT NULL,
      received_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS game_center_user_states (
      parent_user_id TEXT PRIMARY KEY NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS coin_transfers (
      request_id TEXT PRIMARY KEY NOT NULL,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS consumed_parent_launches (
      launch_id TEXT PRIMARY KEY NOT NULL,
      parent_user_id TEXT NOT NULL,
      parent_session_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at TEXT NOT NULL
    )
  `);
  seedDatabase();
  applySandboxCoinConversionMigration(database);
  return database;
}

export function listGameRegistrations(): GameRegistration[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      id,
      app_key AS appKey,
      app_name AS appName,
      provider_name AS providerName,
      description,
      launch_url AS launchUrl,
      api_base_url AS apiBaseUrl,
      auth_endpoint AS authEndpoint,
      balance_endpoint AS balanceEndpoint,
      add_chips_endpoint AS addChipsEndpoint,
      deduct_chips_endpoint AS deductChipsEndpoint,
      credential_reference AS credentialReference,
      signature_algorithm AS signatureAlgorithm,
      external_user_id_field AS externalUserIdField,
      transaction_id_field AS transactionIdField,
      transaction_type_field AS transactionTypeField,
      game_type_field AS gameTypeField,
      request_id_field AS requestIdField,
      category,
      cost_per_play AS costPerPlay,
      launch_type AS launchType,
      status,
      active,
      created_at AS createdAt
    FROM game_registrations
    ORDER BY created_at DESC
  `).all() as Array<Omit<GameRegistration, "active"> & { active: number }>;
  return rows.map((row) => ({ ...row, active: Boolean(row.active) }));
}

export function createGameRegistration(input: GameRegistrationInput): GameRegistration {
  const db = getDatabase();
  const appKey = createHash("sha256").update(randomBytes(32)).digest("hex");
  const signingSecret = createHash("sha256").update(randomBytes(32)).digest("hex");
  const registration: GameRegistration = {
    ...input,
    appKey,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO game_registrations (
      id, app_key, app_name, provider_name, description, launch_url, api_base_url,
      auth_endpoint, balance_endpoint, add_chips_endpoint, deduct_chips_endpoint, credential_reference,
      signature_algorithm, external_user_id_field, transaction_id_field,
      transaction_type_field, game_type_field, request_id_field, category, cost_per_play,
      launch_type, status, active, signing_secret_ciphertext, created_at
    ) VALUES (
      @id, @appKey, @appName, @providerName, @description, @launchUrl, @apiBaseUrl,
      @authEndpoint, @balanceEndpoint, @addChipsEndpoint, @deductChipsEndpoint, @credentialReference,
      @signatureAlgorithm, @externalUserIdField, @transactionIdField,
      @transactionTypeField, @gameTypeField, @requestIdField, @category, @costPerPlay,
      @launchType, @status, @active, @signingSecretCiphertext, @createdAt
    )
  `).run({
    ...registration,
    active: registration.active ? 1 : 0,
    signingSecretCiphertext: encryptProviderSecret(signingSecret),
  });
  return registration;
}

export function findGameRegistration(appKey: string): { registration: GameRegistration; signingSecret: string } | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT *, app_key AS appKey, app_name AS appName, provider_name AS providerName,
      launch_url AS launchUrl, api_base_url AS apiBaseUrl, auth_endpoint AS authEndpoint,
      balance_endpoint AS balanceEndpoint,
      add_chips_endpoint AS addChipsEndpoint, deduct_chips_endpoint AS deductChipsEndpoint,
      credential_reference AS credentialReference, signature_algorithm AS signatureAlgorithm,
      external_user_id_field AS externalUserIdField, transaction_id_field AS transactionIdField,
      transaction_type_field AS transactionTypeField, game_type_field AS gameTypeField,
      request_id_field AS requestIdField, cost_per_play AS costPerPlay,
      launch_type AS launchType, active, created_at AS createdAt
    FROM game_registrations
    WHERE app_key = ? COLLATE NOCASE OR id = ? COLLATE NOCASE OR (? = 'inbetween' AND id = 'game-reg-003')
  `).get(appKey, appKey, appKey) as (GameRegistration & { signing_secret_ciphertext: string }) | undefined;
  if (!row) return null;
  const { signing_secret_ciphertext: encryptedSecret, ...registration } = row;
  return {
    registration: { ...registration, active: Boolean(registration.active) } as GameRegistration,
    signingSecret: decryptProviderSecret(encryptedSecret),
  };
}

type ProviderTransactionInput = Omit<ProviderTransaction, "id" | "createdAt" | "status">;

export function findProviderTransaction(
  registrationId: string,
  externalTransactionId: string,
  direction: ProviderTransaction["direction"],
): ProviderTransaction | null {
  const db = getDatabase();
  return db.prepare(`
    SELECT *, registration_id AS registrationId, external_user_id AS externalUserId,
      external_transaction_id AS externalTransactionId, request_id AS requestId,
      round_id AS roundId, transaction_type AS transactionType, raw_payload AS rawPayload,
      created_at AS createdAt
    FROM provider_transactions
    WHERE registration_id = ? AND external_transaction_id = ? AND direction = ?
  `).get(registrationId, externalTransactionId, direction) as ProviderTransaction | null;
}

export function createProviderTransaction(input: ProviderTransactionInput): { transaction: ProviderTransaction; duplicate: boolean } {
  const db = getDatabase();
  const existing = findProviderTransaction(input.registrationId, input.externalTransactionId, input.direction);
  if (existing) return { transaction: { ...existing, status: "duplicate" }, duplicate: true };

  const transaction: ProviderTransaction = {
    ...input,
    id: randomUUID(),
    status: "accepted",
    createdAt: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO provider_transactions (
      id, registration_id, app_key, external_user_id, external_transaction_id,
      request_id, round_id, direction, amount, transaction_type, game_type,
      source, status, signature, raw_payload, created_at
    ) VALUES (
      @id, @registrationId, @appKey, @externalUserId, @externalTransactionId,
      @requestId, @roundId, @direction, @amount, @transactionType, @gameType,
      @source, @status, @signature, @rawPayload, @createdAt
    )
  `).run(transaction);
  return { transaction, duplicate: false };
}

export function createCoinPurchase(playerId: string, coinPackage: CoinPackage): CoinPurchase {
  const db = getDatabase();
  const purchase: CoinPurchase = {
    id: randomUUID(),
    referenceNumber: `GC-${randomUUID()}`,
    playerId,
    packageId: coinPackage.id,
    amountMinor: coinPackage.amountMinor,
    coins: coinPackage.coins,
    currency: "PHP",
    status: "pending",
    checkoutSessionId: null,
    checkoutUrl: null,
    paymentId: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO coin_purchases (
      id, reference_number, player_id, package_id, amount_minor, coins, currency, status, created_at
    ) VALUES (
      @id, @referenceNumber, @playerId, @packageId, @amountMinor, @coins, @currency, @status, @createdAt
    )
  `).run(purchase);
  return purchase;
}

export function setCoinPurchaseCheckout(
  purchaseId: string,
  checkoutSessionId: string,
  checkoutUrl: string,
): CoinPurchase | null {
  const db = getDatabase();
  db.prepare(`
    UPDATE coin_purchases
    SET checkout_session_id = ?, checkout_url = ?
    WHERE id = ? AND status = 'pending'
  `).run(checkoutSessionId, checkoutUrl, purchaseId);
  const row = db.prepare("SELECT * FROM coin_purchases WHERE id = ?").get(purchaseId) as CoinPurchaseRow | undefined;
  return row ? mapCoinPurchase(row) : null;
}

export function failCoinPurchase(purchaseId: string): void {
  getDatabase().prepare("UPDATE coin_purchases SET status = 'failed' WHERE id = ? AND status = 'pending'").run(purchaseId);
}

export function findCoinPurchase(referenceNumber: string): CoinPurchase | null {
  const row = getDatabase().prepare("SELECT * FROM coin_purchases WHERE reference_number = ?").get(referenceNumber) as CoinPurchaseRow | undefined;
  return row ? mapCoinPurchase(row) : null;
}

export function findCoinPurchaseForPlayer(purchaseId: string, playerId: string): CoinPurchase | null {
  const row = getDatabase().prepare("SELECT * FROM coin_purchases WHERE id = ? AND player_id = ?").get(purchaseId, playerId) as CoinPurchaseRow | undefined;
  return row ? mapCoinPurchase(row) : null;
}

export type CoinPurchaseFulfillment = "credited" | "duplicate" | "not-found" | "session-mismatch" | "player-mismatch" | "not-pending";

export function fulfillCoinPurchase(input: {
  playerId: string;
  referenceNumber: string;
  checkoutSessionId: string;
  paymentId: string;
  eventId: string;
}): CoinPurchaseFulfillment {
  const db = getDatabase();
  return db.transaction((): CoinPurchaseFulfillment => {
    const row = db.prepare("SELECT * FROM coin_purchases WHERE reference_number = ?").get(input.referenceNumber) as CoinPurchaseRow | undefined;
    if (!row) return "not-found";
    if (row.player_id !== input.playerId) return "player-mismatch";
    if (row.checkout_session_id !== input.checkoutSessionId) return "session-mismatch";

    const priorEvent = db.prepare("SELECT event_id FROM coin_purchase_webhook_events WHERE event_id = ?").get(input.eventId);
    if (priorEvent || row.status === "paid") return "duplicate";
    if (row.status !== "pending") return "not-pending";

    const playerState = readParentPlayerState(row.player_id);
    if (!playerState || playerState.profile.id !== row.player_id) return "player-mismatch";
    const profile = playerState.profile as unknown as Record<string, any>;
    const wallet = playerState.wallet;
    const adminUsers = playerState.adminUsers as unknown as Record<string, any>;
    const managedProfile = findManagedProfileRecord(adminUsers, profile);

    const paidAt = new Date().toISOString();
    const source = `paymongo-test:${row.reference_number}`;
    const walletTransaction = {
      id: `payment-${row.id}`,
      type: TransactionType.AdministrativeCredit,
      amount: row.coins,
      reason: `Sandbox coin package: ${row.package_id}`,
      createdAt: paidAt,
      source,
    };
    const updatedWallet: PersistedState["wallet"] = {
      ...wallet,
      balance: wallet.balance + row.coins,
      transactions: [walletTransaction, ...(wallet.transactions ?? [])],
    };
    const historyEntry = {
      id: walletTransaction.id,
      userId: managedProfile?.id ?? row.player_id,
      userName: profile.displayName,
      adjustmentType: CoinAdjustmentType.Credit,
      amount: row.coins,
      reason: walletTransaction.reason,
      adminName: "PayMongo Test Checkout",
      createdAt: paidAt,
    };
    const updatedAdminUsers: PersistedState["adminUsers"] = {
      ...playerState.adminUsers,
      history: [historyEntry, ...playerState.adminUsers.history],
      users: playerState.adminUsers.users.map((user) =>
        user.id === managedProfile?.id ? { ...user, coinBalance: Number(updatedWallet.balance) } : user,
      ),
    };
    playerState.wallet = updatedWallet;
    playerState.adminUsers = updatedAdminUsers;
    db.prepare(`
      UPDATE game_center_user_states
      SET state_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE parent_user_id = ?
    `).run(JSON.stringify(playerState), row.player_id);
    db.prepare(`
      INSERT INTO coin_purchase_webhook_events (event_id, purchase_id, received_at)
      VALUES (?, ?, ?)
    `).run(input.eventId, row.id, paidAt);
    db.prepare(`
      UPDATE coin_purchases
      SET status = 'paid', payment_id = ?, paid_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(input.paymentId, paidAt, row.id);
    return "credited";
  })();
}

export function synchronizeDemoProfileManagedBalance(playerId: string): void {
  const db = getDatabase();
  db.transaction(() => {
    const state = readState();
    if (state.profile.id !== playerId) return;
    const managedProfile = findManagedProfileRecord(state.adminUsers, state.profile);
    if (!managedProfile) return;

    const updatedAdminUsers = {
      ...state.adminUsers,
      users: state.adminUsers.users.map((user) =>
        user.id === managedProfile.id ? { ...user, coinBalance: state.wallet.balance } : user,
      ),
      history: state.adminUsers.history.map((entry) =>
        entry.userId === playerId
          ? { ...entry, userId: managedProfile.id, userName: managedProfile.displayName }
          : entry,
      ),
    };
    db.prepare(`
      INSERT INTO app_state (key, value, updated_at)
      VALUES ('adminUsers', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(JSON.stringify(updatedAdminUsers));
  })();
}

export function readState(): PersistedState {
  const db = getDatabase();
  const rows = db.prepare("SELECT key, value FROM app_state").all() as Array<{ key: PersistedKey; value: string }>;
  const state = {} as PersistedState;
  for (const row of rows) {
    if (STATE_KEYS.includes(row.key)) {
      Object.assign(state, { [row.key]: JSON.parse(row.value) });
    }
  }
  return state;
}

export function saveState(state: PersistedState): void {
  getDatabase();
  writeState(state);
}

export function resetState(): PersistedState {
  getDatabase();
  database!.prepare("DELETE FROM app_state").run();
  database!.prepare("DELETE FROM game_registrations").run();
  database!.prepare("DELETE FROM coin_purchases").run();
  database!.prepare("DELETE FROM coin_purchase_webhook_events").run();
  database!.prepare("DELETE FROM game_center_user_states").run();
  database!.prepare("DELETE FROM consumed_parent_launches").run();
  database!.prepare("DELETE FROM coin_transfers").run();
  seedDatabase();
  return readState();
}

export function revealGameRegistrationCredentials(appKey: string): { appKey: string; signingSecret: string } | null {
  const record = findGameRegistration(appKey);
  return record ? { appKey: record.registration.appKey, signingSecret: record.signingSecret } : null;
}

export function findParentPlayerState(parentUserId: string): PersistedState | null {
  return readParentPlayerState(parentUserId);
}

