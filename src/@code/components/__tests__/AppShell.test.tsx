import { render, screen } from "@testing-library/react";
import { AppShell } from "../AppShell";

jest.mock("../ProfileSidePanel", () => ({
  ProfileSidePanel: () => <aside aria-label="Profile panel" />,
}));

describe("AppShell", () => {
  it("submits logout and returns to the configured Barangay Platform dashboard", () => {
    render(
      <AppShell returnUrl="http://localhost:3000/admin">
        <p>Game Center content</p>
      </AppShell>
    );

    const backButton = screen.getByRole("button", { name: "Back to Barangay Platform" });
    expect(backButton).toHaveAttribute("type", "submit");
    expect(backButton.closest("form")).toHaveAttribute("action", "/api/auth/logout");
    expect(backButton.closest("form")).toHaveAttribute("method", "post");
    expect(screen.getByDisplayValue("http://localhost:3000/admin"))
      .toHaveAttribute("name", "returnUrl");
  });
});