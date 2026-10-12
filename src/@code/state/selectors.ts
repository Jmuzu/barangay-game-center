import { GameLaunchType, GameStatus, TransactionType } from "@shared/enums";
import { isSameCalendarDay } from "@shared/utils";
import { createSelector } from "@reduxjs/toolkit";
import type { Game } from "@shared/types";
import type { RootState } from "./store";

export const selectPlayerProfile = (state: RootState) => state.profile;
export const selectWallet = (state: RootState) => state.wallet;
export const selectWalletBalance = (state: RootState) => state.wallet.balance;
export const selectWalletTransactions = (state: RootState) => state.wallet.transactions;
export const selectDailyShareRemaining = (state: RootState) => {
  const sharedToday = state.wallet.lastShareDate && isSameCalendarDay(state.wallet.lastShareDate, new Date().toISOString())
    ? state.wallet.sharedToday
    : 0;
  return Math.max(0, state.wallet.dailyShareLimit - sharedToday);
};

function registrationToGame(registration: RootState["gameRegistrations"]["items"][number]): Game {
  return {
    id: `registered-${registration.id}`,
    slug: registration.appKey,
    name: registration.appName,
    provider: registration.providerName,
    description: registration.description,
    category: registration.category,
    costPerPlay: registration.costPerPlay,
    badge: registration.active ? "Integrated" : "Deactivated",
    launchType: registration.launchType || GameLaunchType.ExternalUrl,
    launchTarget: registration.launchUrl,
    status: registration.active && registration.status === GameStatus.Active ? GameStatus.Active : GameStatus.ComingSoon,
  };
}

const selectRegisteredGames = (state: RootState) => state.gameRegistrations.items;
export const selectAllGames = createSelector(
  [selectRegisteredGames],
  (registrations) => registrations.map(registrationToGame),
);
export const selectActiveGames = createSelector(
  [selectRegisteredGames],
  (registrations) => registrations
    .filter((registration) => registration.active && registration.status === GameStatus.Active)
    .map(registrationToGame),
);
export const selectGameBySlug = (slug: string) => (state: RootState) =>
  state.games.find((game) => game.slug === slug);

export const selectFeedPosts = createSelector(
  [(state: RootState) => state.feed],
  (feed) => [...feed].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
);

export const selectManagedUsers = (state: RootState) => state.adminUsers.users;
export const selectManagedUserById = (userId: string) => (state: RootState) =>
  state.adminUsers.users.find((user) => user.id === userId);
export const selectCoinHistory = createSelector(
  [(state: RootState) => state.adminUsers.history],
  (history) => [...history].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
);

export const selectMissions = (state: RootState) => state.missions;

export const selectGameRegistrations = (state: RootState) => state.gameRegistrations;

export const selectStreak = (state: RootState) => state.streak;

export const selectClaimedMissionIds = (state: RootState) => state.playerMissions.claimedMissionIds;

export const selectLifetimeCoinsSpent = (state: RootState) =>
  state.wallet.transactions
    .filter((transaction) => transaction.type === TransactionType.GameSpend)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
