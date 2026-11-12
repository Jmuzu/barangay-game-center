import { GameCategory, GameLaunchType, GameStatus } from "@shared/enums";
import type { GameRegistration } from "@shared/types";
import {
  gameRegistrationsReducer,
  registrationCreated,
  registrationDeleted,
  registrationUpdated,
  registrationsLoaded,
  registrationsLoading,
} from "@code/state/gameRegistrationsSlice";
import { selectAllGames } from "@code/state/selectors";

const registration: GameRegistration = {
  id: "registration-001",
  appKey: "inbetween-live",
  appName: "InBetween Live",
  providerName: "InBetween",
  description: "Live game provider",
  category: GameCategory.Community,
  costPerPlay: 0,
  launchType: GameLaunchType.ExternalUrl,
  status: GameStatus.Active,
  active: true,
  launchUrl: "https://games.example.com/inbetween",
  apiBaseUrl: "https://api.example.com",
  authEndpoint: "/auth",
  balanceEndpoint: "/balance",
  addChipsEndpoint: "/add-chips",
  deductChipsEndpoint: "/deduct-chips",
  credentialReference: "secret-manager/inbetween-live",
  signatureAlgorithm: "HMAC-SHA256",
  externalUserIdField: "username",
  transactionIdField: "transId",
  transactionTypeField: "transactionType",
  gameTypeField: "gameType",
  requestIdField: "request_id",
  createdAt: "2026-09-24T00:00:00.000Z",
};

describe("gameRegistrationsReducer", () => {
  it("tracks loading and loaded registration state", () => {
    const loading = gameRegistrationsReducer(undefined, registrationsLoading());
    expect(loading.status).toBe("loading");

    const loaded = gameRegistrationsReducer(loading, registrationsLoaded([registration]));
    expect(loaded.status).toBe("ready");
    expect(loaded.items).toEqual([registration]);
  });

  it("adds only the server-created registration to the cache", () => {
    const next = gameRegistrationsReducer(undefined, registrationCreated(registration));
    expect(next.items).toEqual([registration]);
    expect(next.error).toBeNull();
  });

  it("replaces the edited registration without changing its position", () => {
    const updated = { ...registration, appName: "InBetween Live Updated" };
    const state = gameRegistrationsReducer(
      { ...gameRegistrationsReducer(undefined, registrationCreated(registration)), items: [registration] },
      registrationUpdated(updated),
    );

    expect(state.items).toEqual([updated]);
  });

  it("removes a deleted registration from the cache", () => {
    const state = gameRegistrationsReducer(
      { ...gameRegistrationsReducer(undefined, registrationCreated(registration)), items: [registration] },
      registrationDeleted(registration.appKey),
    );

    expect(state.items).toEqual([]);
    expect(state.status).toBe("ready");
  });

  it("publishes active registered apps in the home catalog", () => {
    const state = {
      games: [],
      gameRegistrations: { items: [registration], status: "ready", error: null },
    } as never;
    const games = selectAllGames(state);

    expect(selectAllGames(state)).toBe(games);
    expect(games).toEqual([expect.objectContaining({
      slug: registration.appKey,
      name: registration.appName,
      launchTarget: registration.launchUrl,
      status: GameStatus.Active,
    })]);
  });

  it("keeps inactive registered apps visible as deactivated coming-soon games", () => {
    const games = selectAllGames({
      games: [{
        id: "static-game",
        slug: "static-game",
        name: "Static game",
        provider: "Platform",
        description: "Should not be shown",
        category: GameCategory.Community,
        costPerPlay: 0,
        launchType: GameLaunchType.ExternalUrl,
        launchTarget: "",
        status: GameStatus.Active,
      }],
      gameRegistrations: { items: [{ ...registration, active: false }], status: "ready", error: null },
    } as never);

    expect(games).toEqual([expect.objectContaining({
      name: registration.appName,
      badge: "Deactivated",
      status: GameStatus.ComingSoon,
    })]);
  });
});