import { ReactNode } from "react";
import { ProfileSidePanel } from "./ProfileSidePanel";

interface AppShellProps {
  children: ReactNode;
  returnUrl: string;
}

export function AppShell({ children, returnUrl }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--ink)] platform-scale">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/95 backdrop-blur platform-slide">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-4 px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--navy)] text-lg font-bold text-white">B</div>
            <div>
              <p className="text-sm font-bold tracking-tight text-[var(--navy)]">Barangay Platform</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Game Center</p>
            </div>
          </div>
          <div className="hidden max-w-sm flex-1 items-center rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--muted)] md:flex">
            <span className="mr-2 text-base" aria-hidden="true">⌕</span>
            <span>Search games and activities</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Notifications" className="relative rounded-xl p-2 text-[var(--muted)] transition hover:bg-[var(--mint)] hover:text-[var(--navy)]">
              <span className="text-lg" aria-hidden="true">◌</span>
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
            </button>
            <form action="/api/auth/logout" method="post">
              <input type="hidden" name="returnUrl" value={returnUrl} />
              <button
                type="submit"
                aria-label="Back to Barangay Platform"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--navy)] hover:bg-[var(--background)]"
              >
                <span aria-hidden="true">←</span>
                <span>Back to Barangay Platform</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 py-6 lg:flex-row lg:px-8 lg:py-8">
        <ProfileSidePanel />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
