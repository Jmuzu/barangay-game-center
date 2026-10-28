"use client";

import { GameLaunchType, GameStatus } from "@shared/enums";
import type { Game } from "@shared/types";
import { streakReplaced, useAppDispatch, useAppSelector, walletReplaced } from "@code/state";
import { selectAllGames, selectWalletBalance } from "@code/state";
import { GameCard } from "./GameCard";

export function GameCatalog() {
  const dispatch = useAppDispatch();
  const games = useAppSelector(selectAllGames);
  const balance = useAppSelector(selectWalletBalance);
  async function handlePlay(game: Game) {
    if (game.status !== GameStatus.Active || balance < game.costPerPlay) {
      return;
    }

    const idempotencyKey = crypto.randomUUID();
    const launchWindow = game.launchType === GameLaunchType.ExternalUrl && game.launchTarget
      ? window.open("about:blank", "_blank")
      : null;
    try {
      const playResponse = await fetch("/api/games/play", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ gameKey: game.slug }),
      });
      const playResult = await playResponse.json() as {
        wallet?: Parameters<typeof walletReplaced>[0];
        streak?: Parameters<typeof streakReplaced>[0];
        message?: string;
      };
      if (!playResponse.ok || !playResult.wallet || !playResult.streak) {
        throw new Error(playResult.message || "Could not start this game.");
      }
      dispatch(walletReplaced(playResult.wallet));
      dispatch(streakReplaced(playResult.streak));
    } catch {
      launchWindow?.close();
      return;
    }

    if (game.launchType === GameLaunchType.ExternalUrl && game.launchTarget) {
      try {
        const response = await fetch(`/api/game-registrations/${encodeURIComponent(game.slug)}/launch`);
        const body = (await response.json()) as { launchUrl?: string; message?: string };
        if (!response.ok || !body.launchUrl) throw new Error(body.message || "Could not launch the registered app.");
        if (launchWindow) {
          launchWindow.opener = null;
          launchWindow.location.replace(body.launchUrl);
        }
      } catch {
        launchWindow?.close();
      }
    }
  }

  return (
    <section aria-label="Game catalog" className="flex flex-col gap-6 platform-rise platform-delay-2">
      <header className="rounded-3xl bg-[var(--navy)] px-6 py-7 text-white shadow-lg shadow-teal-950/10 platform-shimmer sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100/70">Player dashboard</p>
        <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Your next play starts here.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/70">Explore community games, spend coins, and keep your barangay activity moving.</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 sm:min-w-36">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Available</p>
            <p className="mt-1 text-2xl font-bold">{balance.toLocaleString("en-US")} <span className="text-sm font-medium text-emerald-100/70">coins</span></p>
          </div>
        </div>
      </header>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--navy)]">Available games</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Use your coins to play any integrated game.</p>
        </div>
        <span className="hidden rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-bold text-[var(--navy)] sm:inline-flex">{games.length} games</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {games.map((game, index) => (
          <div key={game.id} className={`platform-delay-${Math.min(index + 1, 4)}`}>
            <GameCard game={game} balance={balance} onPlay={handlePlay} />
          </div>
        ))}
      </div>
    </section>
  );
}
