import { Button, Card } from "@shared/components";
import { MissionStatus } from "@shared/enums";
import type { Mission } from "@shared/types";
import { formatCoins } from "@shared/utils";
import { MissionProgressBar } from "./MissionProgressBar";

interface PlayerMissionCardProps {
  mission: Mission;
  progressCurrent: number | null;
  progressTarget: number | null;
  claimed: boolean;
  pending?: boolean;
  onClaim: () => void;
}

export function PlayerMissionCard({
  mission,
  progressCurrent,
  progressTarget,
  claimed,
  pending = false,
  onClaim,
}: PlayerMissionCardProps) {
  const isUnavailable = mission.status === MissionStatus.Inactive;
  const isEligible = progressTarget === null ? true : (progressCurrent ?? 0) >= progressTarget;
  const claimDisabled = claimed || pending || isUnavailable || !isEligible;

  const buttonLabel = pending ? "Claiming..." : claimed ? "Claimed" : isUnavailable ? "Unavailable" : "Claim reward";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-white">{mission.title}</h3>
          <p className="text-sm text-slate-400">{mission.description}</p>
        </div>
        <span className="whitespace-nowrap text-sm font-semibold text-amber-200">
          {formatCoins(mission.bonusCoins)}
        </span>
      </div>

      {progressTarget !== null ? (
        <MissionProgressBar current={progressCurrent ?? 0} target={progressTarget} />
      ) : (
        <p className="text-xs text-slate-400">Claim this mission once you believe you have completed it.</p>
      )}

      <Button
        variant={claimed ? "secondary" : "primary"}
        disabled={claimDisabled}
        onClick={onClaim}
        className="self-start"
      >
        {buttonLabel}
      </Button>
    </Card>
  );
}
