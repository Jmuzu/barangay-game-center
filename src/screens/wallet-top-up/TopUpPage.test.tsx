import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TopUpPage } from "./TopUpPage";

jest.mock("@code/state", () => ({
  selectWalletBalance: jest.fn(),
  useAppSelector: () => 250,
}));

jest.mock("@shared/components", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CoinBadge: ({ amount, label }: { amount: number; label: string }) => <div>{label}: {amount}</div>,
}));

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("TopUpPage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("keeps package checkout disabled when sandbox credentials are unavailable", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ enabled: false, mode: "test" })) as typeof fetch;

    render(<TopUpPage />);

    expect(await screen.findByText(/test keys and a test webhook secret are required/i)).toBeInTheDocument();
    const buttons = await screen.findAllByRole("button", { name: "Continue to test checkout" });
    const button = buttons[0];
    expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue with custom amount" })).toBeDisabled();
  });

  it.each(["1", "100000"])("submits a custom PHP %s checkout and displays the coin preview", async (amount) => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ enabled: true, mode: "test" }))
      .mockResolvedValueOnce(jsonResponse({ checkoutUrl: "https://checkout.paymongo.test/custom" }, 201));
    global.fetch = fetchMock as typeof fetch;
    const assign = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { search: "", assign, replace: jest.fn() },
    });

    render(<TopUpPage />);
    const button = screen.getByRole("button", { name: "Continue with custom amount" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Amount (PHP)"), { target: { value: amount } });
    expect(screen.getByText(`You will receive ${Number(amount).toLocaleString("en-PH")} demo coins.`)).toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.paymongo.test/custom"));
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ amountPesos: Number(amount) }),
    });
  });

  it.each(["", "0", "-1", "1.5", "100001"])("rejects custom amount '%s' without starting checkout", async (amount) => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ enabled: true, mode: "test" }));
    global.fetch = fetchMock as typeof fetch;
    render(<TopUpPage />);
    const button = screen.getByRole("button", { name: "Continue with custom amount" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Amount (PHP)"), { target: { value: amount } });
    fireEvent.click(button);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a whole-peso amount from PHP 1 to PHP 100,000.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a custom checkout API error and allows retry", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ enabled: true, mode: "test" }))
      .mockResolvedValueOnce(jsonResponse({ message: "Checkout unavailable." }, 503)) as typeof fetch;
    render(<TopUpPage />);
    const button = screen.getByRole("button", { name: "Continue with custom amount" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Amount (PHP)"), { target: { value: "500" } });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Checkout unavailable.");
    expect(button).toBeEnabled();
  });

  it("disables custom and preset checkout while a request is in flight", async () => {
    let finishCheckout: ((value: ReturnType<typeof jsonResponse>) => void) | undefined;
    const checkout = new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
      finishCheckout = resolve;
    });
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ enabled: true, mode: "test" }))
      .mockReturnValueOnce(checkout) as typeof fetch;
    render(<TopUpPage />);
    const button = screen.getByRole("button", { name: "Continue with custom amount" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Amount (PHP)"), { target: { value: "500" } });
    fireEvent.click(button);
    for (const checkoutButton of screen.getAllByRole("button", { name: "Opening checkout..." })) {
      expect(checkoutButton).toBeDisabled();
    }
    expect(screen.getByLabelText("Amount (PHP)")).toBeDisabled();
    if (!finishCheckout) throw new Error("Checkout resolver was not initialized.");
    finishCheckout(jsonResponse({ message: "Try again." }, 503));
    await screen.findByText("Try again.");
  });

  it("redirects only to the checkout URL returned by the server", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ enabled: true, mode: "test" }))
      .mockResolvedValueOnce(jsonResponse({ checkoutUrl: "https://checkout.paymongo.test/session" }, 201));
    global.fetch = fetchMock as typeof fetch;
    const assign = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { search: "", assign, replace: jest.fn() },
    });

    render(<TopUpPage />);

    const buttons = await screen.findAllByRole("button", { name: "Continue to test checkout" });
    const button = buttons[0];
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.paymongo.test/session"));
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ packageId: "sandbox-10" }),
    });
  });
});
