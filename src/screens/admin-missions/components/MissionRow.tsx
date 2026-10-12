"use client";

import { useState } from "react";
import { Button, Card } from "@shared/components";
import { MissionStatus } from "@shared/enums";
import type { Mission } from "@shared/types";
import { formatCoins } from "@shared/utils";
import { MissionBonusForm } from "./MissionBonusForm";
import { MissionStatusBadge } from "./MissionStatusBadge";

interface MissionRowProps {
  mission: Mission;
  onUpdateBonus: (bonusCoins: number) => void;
  onToggleStatus: () => void;
  pending?: boolean;
}

export function MissionRow({ mission, onUpdateBonus, onToggleStatus, pending = false }: MissionRowProps) {
  const [isEditingBonus, setIsEditingBonus] = useState(false);

  return (
    <Card className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <p className="truncate font-semibold text-[var(--navy)]">{mission.title}</p>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{mission.description}</p>
        </div>

        <div className="flex items-center justify-between gap-3 lg:col-span-3 lg:justify-start">
          <MissionStatusBadge status={mission.status} />
          <span className="whitespace-nowrap text-sm font-semibold text-[var(--gold)]">
            Bonus: {formatCoins(mission.bonusCoins)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:col-span-4">
          <Button className="w-full" variant="secondary" disabled={pending} onClick={() => setIsEditingBonus((prev) => !prev)}>
            {isEditingBonus ? "Cancel" : "Edit bonus"}
          </Button>
          <Button
            className="w-full"
            disabled={pending}
            variant={mission.status === MissionStatus.Active ? "danger" : "primary"}
            onClick={onToggleStatus}
          >
            {mission.status === MissionStatus.Active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      {isEditingBonus ? (
        <MissionBonusForm
          currentBonusCoins={mission.bonusCoins}
          onSubmitBonus={(bonusCoins) => {
            onUpdateBonus(bonusCoins);
            setIsEditingBonus(false);
          }}
        />
      ) : null}
    </Card>
  );
}
