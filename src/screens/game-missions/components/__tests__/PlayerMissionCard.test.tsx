import { render, screen, fireEvent } from "@testing-library/react";
import { PlayerMissionCard } from "@screens/game-missions/components/PlayerMissionCard";
import { MissionStatus } from "@shared/enums";
import type { Mission } from "@shared/types";

const mission: Mission = {
  id: "mission-spend-1000",
  title: "Big Spender I",
  description: "Spend a total of 1,000 coins.",
  bonusCoins: 50,
  status: MissionStatus.Active,
};

describe("PlayerMissionCard", () => {
  it("disables claiming when progress has not reached the target", () => {
    const onClaim = jest.fn();
    render(
      <PlayerMissionCard mission={mission} progressCurrent={400} progressTarget={1000} claimed={false} onClaim={onClaim} />
    );

    const button = screen.getByRole("button", { name: /claim reward/i });
    expect(button).toBeDisabled();
  });

  it("enables claiming once the target is reached and fires onClaim", () => {
    const onClaim = jest.fn();
    render(
      <PlayerMissionCard mission={mission} progressCurrent={1000} progressTarget={1000} claimed={false} onClaim={onClaim} />
    );

    const button = screen.getByRole("button", { name: /claim reward/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it("shows a claimed state and disables the button", () => {
    render(
      <PlayerMissionCard mission={mission} progressCurrent={1000} progressTarget={1000} claimed={true} onClaim={jest.fn()} />
    );

    expect(screen.getByRole("button", { name: /claimed/i })).toBeDisabled();
  });

  it("disables the reward button while the claim is pending", () => {
    render(
      <PlayerMissionCard mission={mission} progressCurrent={1000} progressTarget={1000} claimed={false} pending onClaim={jest.fn()} />
    );

    expect(screen.getByRole("button", { name: /claiming/i })).toBeDisabled();
  });

  it("allows manual claiming when there is no automatic progress target", () => {
    const onClaim = jest.fn();
    render(
      <PlayerMissionCard mission={mission} progressCurrent={null} progressTarget={null} claimed={false} onClaim={onClaim} />
    );

    expect(screen.getByRole("button", { name: /claim reward/i })).toBeEnabled();
  });
});
