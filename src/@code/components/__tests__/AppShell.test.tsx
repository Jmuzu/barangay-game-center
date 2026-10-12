import { render, screen } from "@testing-library/react";
import { AppShell } from "../AppShell";

jest.mock("../ProfileSidePanel", () => ({
  ProfileSidePanel: () => <aside aria-label="Profile panel" />,
}));

describe("AppShell", () => {
  it("links back to the configured Barangay Platform dashboard", () => {
    render(
      <AppShell returnUrl="http://localhost:3000/admin">
        <p>Game Center content</p>
      </AppShell>
    );

    expect(screen.getByRole("link", { name: "Back to Barangay Platform" }))
      .toHaveAttribute("href", "http://localhost:3000/admin");
  });
});