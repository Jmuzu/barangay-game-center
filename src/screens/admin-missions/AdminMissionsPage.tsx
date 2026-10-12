"use client";

import { useState } from "react";
import { RequireRole } from "@code/guards";
import {
  missionReplaced,
  selectMissions,
  selectPlayerProfile,
  useAppDispatch,
  useAppSelector,
} from "@code/state";
import { ADMIN_ROLES } from "@shared/utils";
import { MissionRow } from "./components/MissionRow";

export function AdminMissionsPage() {
  const dispatch = useAppDispatch();
  const [pendingMissionId, setPendingMissionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missions = useAppSelector(selectMissions);
  const profile = useAppSelector(selectPlayerProfile);

  async function updateMission(payload: Record<string, unknown>) {
    const missionId = String(payload.missionId ?? "");
    setPendingMissionId(missionId);
    setError(null);
    try {
      const response = await fetch("/api/missions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { message?: string; mission?: (typeof missions)[number] };
      if (!response.ok || !result.mission) throw new Error(result.message || "Could not save mission changes.");
      dispatch(missionReplaced(result.mission));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save mission changes.");
    } finally {
      setPendingMissionId(null);
    }
  }

  return (
    <RequireRole currentRole={profile.role} allowedRoles={ADMIN_ROLES}>
      <section className="flex flex-col gap-6">
        <header>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--navy)]">Missions Manager</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Administrators can set mission bonuses and availability for all players.
          </p>
        </header>

        {error ? <p role="alert" className="text-sm text-[var(--coral)]">{error}</p> : null}

        <div className="flex flex-col gap-3" aria-label="Missions">
          {missions.map((mission) => (
            <MissionRow
              key={mission.id}
              mission={mission}
              onUpdateBonus={(bonusCoins) => void updateMission({ action: "update-bonus", missionId: mission.id, bonusCoins })}
              onToggleStatus={() => void updateMission({
                action: "set-status",
                missionId: mission.id,
                status: mission.status === "active" ? "inactive" : "active",
              })}
              pending={pendingMissionId === mission.id}
            />
          ))}
        </div>
      </section>
    </RequireRole>
  );
}
