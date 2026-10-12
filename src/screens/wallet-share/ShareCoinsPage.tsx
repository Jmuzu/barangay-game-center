"use client";

import { useEffect, useState } from "react";
import { Card, CoinBadge } from "@shared/components";
import { formatCoins } from "@shared/utils";
import {
  selectDailyShareRemaining,
  selectWalletTransactions,
  selectWalletBalance,
  useAppDispatch,
  useAppSelector,
  walletReplaced,
} from "@code/state";
import type { WalletState } from "@shared/types";
import { ShareCoinsForm } from "./components/ShareCoinsForm";

interface ShareRecipient {
  id: string;
  displayName: string;
}

export function ShareCoinsPage() {
  const dispatch = useAppDispatch();
  const balance = useAppSelector(selectWalletBalance);
  const transactions = useAppSelector(selectWalletTransactions);
  const dailyRemaining = useAppSelector(selectDailyShareRemaining);
  const [recipients, setRecipients] = useState<ShareRecipient[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wallet/share", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load eligible players.");
        return response.json() as Promise<ShareRecipient[]>;
      })
      .then((data) => {
        if (!cancelled) setRecipients(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Could not load eligible players.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRecipients(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleShare(input: { recipientId: string; amount: number; note?: string }) {
    const response = await fetch("/api/wallet/share", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(input),
    });
    const body = await response.json() as { message?: string; wallet?: WalletState };
    if (!response.ok || !body.wallet) throw new Error(body.message || "Could not complete the transfer.");
    dispatch(walletReplaced(body.wallet));
  }

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-bold text-white">Share coins</h2>
        <p className="text-sm text-slate-400">
          Send coins to another player. Daily sharing remaining: {formatCoins(dailyRemaining)}.
        </p>
      </header>

      <CoinBadge amount={balance} label="Your balance" />

      {isLoadingRecipients ? <p role="status" className="text-sm text-slate-400">Loading eligible players...</p> : null}
      {loadError ? <p role="alert" className="text-sm text-rose-400">{loadError}</p> : null}
      {!isLoadingRecipients && !loadError && recipients.length === 0 ? (
        <p className="text-sm text-slate-400">No other active players are available to receive coins.</p>
      ) : null}
      {transactions.length > 0 ? (
        <Card>
          <h3 className="font-semibold text-white">Recent coin activity</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {transactions.slice(0, 5).map((transaction) => (
              <li key={transaction.id} className="flex justify-between gap-3 text-sm text-slate-300">
                <span>{transaction.reason}</span>
                <span>{formatCoins(transaction.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <ShareCoinsForm
          balance={balance}
          dailyRemaining={dailyRemaining}
          recipients={recipients}
          disabled={isLoadingRecipients || !!loadError || recipients.length === 0}
          onShare={handleShare}
        />
      </Card>
    </section>
  );
}
