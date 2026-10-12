"use client";

import { useState } from "react";
import { MissionStatus } from "@shared/enums";
import {
  missionClaimed,
  selectClaimedMissionIds,
  selectLifetimeCoinsSpent,
  selectMissions,
  selectStreak,
  useAppDispatch,
  useAppSelector,
  walletReplaced,
} from "@code/state";
import { getMissionProgressTarget, getMissionProgressValue } from "@shared/helpers";
import { STREAK_MILESTONES } from "@shared/utils";
import { StreakBar } from "./components/StreakBar";
import { PlayerMissionCard } from "./components/PlayerMissionCard";

export function GameMissionsPage() {
  const dispatch = useAppDispatch();
  const [pendingMissionId, setPendingMissionId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const missions = useAppSelector(selectMissions);
  const streak = useAppSelector(selectStreak);
  const claimedMissionIds = useAppSelector(selectClaimedMissionIds);
  const lifetimeCoinsSpent = useAppSelector(selectLifetimeCoinsSpent);

  const availableMissions = missions.filter((mission) => mission.status === MissionStatus.Active);

  async function handleClaim(missionId: string) {
    setPendingMissionId(missionId);
    setClaimError(null);
    try {
      const response = await fetch("/api/missions/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      const result = await response.json() as { message?: string; wallet?: Parameters<typeof walletReplaced>[0]; claimedMissionIds?: string[] };
      if (!response.ok || !result.wallet) throw new Error(result.message || "Could not claim this mission.");
      dispatch(walletReplaced(result.wallet));
      dispatch(missionClaimed({ missionId }));
    } catch (cause) {
      setClaimError(cause instanceof Error ? cause.message : "Could not claim this mission.");
    } finally {
      setPendingMissionId(null);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-bold text-white">Missions</h2>
        <p className="text-sm text-slate-400">
          Keep your play streak alive and complete missions to earn bonus coins.
        </p>
      </header>

      <StreakBar
        currentStreak={streak.currentStreak}
        milestones={STREAK_MILESTONES}
        claimedMilestoneDays={streak.claimedMilestoneDays}
      />

      {claimError ? <p role="alert" className="text-sm text-rose-400">{claimError}</p> : null}

      <div className="flex flex-col gap-3" aria-label="Available missions">
        {availableMissions.map((mission) => {
          const progressTarget = getMissionProgressTarget(mission.id);
          const progressCurrent = getMissionProgressValue(mission.id, {
            streakDays: streak.currentStreak,
            lifetimeCoinsSpent,
          });

          return (
            <PlayerMissionCard
              key={mission.id}
              mission={mission}
              progressCurrent={progressCurrent}
              progressTarget={progressTarget}
              claimed={claimedMissionIds.includes(mission.id)}
              pending={pendingMissionId === mission.id}
              onClaim={() => void handleClaim(mission.id)}
            />
          );
        })}
      </div>
    </section>
  );
}
