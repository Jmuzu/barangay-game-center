"use client";

import Link from "next/link";
import { Avatar, Button } from "@shared/components";
import { useAppSelector } from "@code/state";
import { selectPlayerProfile, selectWalletBalance } from "@code/state";
import { SideNav } from "./SideNav";

export function ProfileSidePanel() {
  const profile = useAppSelector(selectPlayerProfile);
  const balance = useAppSelector(selectWalletBalance);

  return (
    <aside
      aria-label="Player panel"
      className="flex w-full flex-col gap-5 platform-slide platform-delay-1 lg:sticky lg:top-24 lg:h-fit lg:w-64 lg:shrink-0"
    >
      <div className="rounded-2xl bg-[var(--navy)] p-5 text-white shadow-lg shadow-teal-950/10 platform-shimmer">
        <div className="flex items-center gap-3">
          <Avatar emoji={profile.avatarEmoji} name={profile.displayName} size="lg" />
          <div>
            <p className="font-semibold">{profile.displayName}</p>
            <p className="text-xs text-emerald-100/70">{profile.homeBarangay}</p>
          </div>
        </div>
        <div className="mt-5 rounded-xl bg-white/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Coin balance</p>
          <div className="mt-1 text-2xl font-bold">{balance.toLocaleString("en-US")} <span className="text-sm font-medium text-emerald-100/70">coins</span></div>
        </div>
      </div>

      <div className="flex gap-2">
        <Link href="/profile" className="flex-1">
          <Button variant="secondary" className="platform-account-button w-full">Account</Button>
        </Link>
        <Link href="/wallet/share" className="flex-1">
          <Button variant="primary" className="w-full">Share</Button>
        </Link>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white p-2 shadow-sm">
        <p className="px-3 pb-2 pt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Workspace</p>
        <SideNav />
      </div>
    </aside>
  );
}
