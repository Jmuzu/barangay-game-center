import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { AuthorRole, GameCategory, GameLaunchType, GameStatus } from "@shared/enums";
import type { GameRegistration } from "@shared/types";
import { makeStore } from "@code/state/store";
import { GameRegistrationPage } from "./GameRegistrationPage";

const registration: GameRegistration = {
  id: "registration-1",
  appKey: "app-key-1",
  appName: "Example Game",
  providerName: "Example Provider",
  description: "An external game",
  category: GameCategory.Community,
  costPerPlay: 0,
  launchType: GameLaunchType.ExternalUrl,
  status: GameStatus.Active,
  active: true,
  launchUrl: "https://games.example.com",
  apiBaseUrl: "https://api.example.com",
  authEndpoint: "/auth",
  balanceEndpoint: "/balance",
  addChipsEndpoint: "/add-chips",
  deductChipsEndpoint: "/deduct-chips",
  credentialReference: "secret-manager/example-game",
  signatureAlgorithm: "HMAC-SHA256",
  externalUserIdField: "username",
  transactionIdField: "transId",
  transactionTypeField: "transactionType",
  gameTypeField: "gameType",
  requestIdField: "request_id",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function renderPage() {
  const store = makeStore({
    profile: {
      id: "admin-1",
      displayName: "Game Center Admin",
      avatarEmoji: "A",
      homeBarangay: "Sample",
      bio: "",
      role: AuthorRole.SuperAdmin,
    },
    gameRegistrations: {
      items: [],
      status: "idle",
      error: null,
    },
  }, false);
  return render(
    <Provider store={store}>
      <GameRegistrationPage />
    </Provider>,
  );
}

describe("GameRegistrationPage", () => {
  const originalFetch = global.fetch;
  const originalScrollTo = window.scrollTo;

  afterEach(() => {
    global.fetch = originalFetch;
    window.scrollTo = originalScrollTo;
    jest.restoreAllMocks();
  });

  it("edits a registration through the API and keeps its generated credentials", async () => {
    const updatedRegistration = { ...registration, appName: "Updated Game" };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse([registration]))
      .mockResolvedValueOnce(jsonResponse({ registration: updatedRegistration }));
    global.fetch = fetchMock as typeof fetch;
    window.scrollTo = jest.fn();

    renderPage();
    await screen.findByText("Example Game");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("App name"), {
      target: { value: "Updated Game" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByText("Registration updated. The App Key and Secret are unchanged.");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/game-registrations/app-key-1");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body: expect.stringContaining('"appName":"Updated Game"'),
    });
    expect(await screen.findByText("Updated Game")).toBeInTheDocument();
  });

  it("confirms deletion and removes the app from the list", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse([registration]))
      .mockResolvedValueOnce(jsonResponse({
        message: "Registration deleted. Provider transaction history was retained.",
      }));
    global.fetch = fetchMock as typeof fetch;
    jest.spyOn(window, "confirm").mockReturnValue(true);

    renderPage();
    await screen.findByText("Example Game");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await screen.findByText("No external apps have been registered.");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/game-registrations/app-key-1");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("transaction history will be kept"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Provider transaction history was retained."));
  });
});
