import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareCoinsForm } from "../ShareCoinsForm";

const recipients = [{ id: "player-2", displayName: "Maria Santos" }];

function fillShareForm() {
  fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: recipients[0].id } });
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "15" } });
}

describe("ShareCoinsForm", () => {
  it("submits the selected player and reports a server-confirmed transfer", async () => {
    const onShare = jest.fn().mockResolvedValue(undefined);
    render(<ShareCoinsForm balance={50} dailyRemaining={40} recipients={recipients} onShare={onShare} />);
    fillShareForm();
    fireEvent.click(screen.getByRole("button", { name: "Share coins" }));

    await waitFor(() => expect(onShare).toHaveBeenCalledWith({ recipientId: "player-2", amount: 15, note: undefined }));
    expect(await screen.findByRole("status")).toHaveTextContent("Coins shared successfully.");
  });

  it("shows the server error and does not claim success when the transfer fails", async () => {
    const onShare = jest.fn().mockRejectedValue(new Error("Daily limit exceeded."));
    render(<ShareCoinsForm balance={50} dailyRemaining={40} recipients={recipients} onShare={onShare} />);
    fillShareForm();
    fireEvent.click(screen.getByRole("button", { name: "Share coins" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Daily limit exceeded.");
    expect(screen.queryByText("Coins shared successfully.")).not.toBeInTheDocument();
  });
});