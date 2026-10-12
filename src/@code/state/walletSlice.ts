import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { TransactionType } from "@shared/enums";
import type { WalletState } from "@shared/types";
import { clampNonNegative, createId, isSameCalendarDay } from "@shared/utils";
const initialState: WalletState = {
  balance: 0,
  dailyShareLimit: 0,
  sharedToday: 0,
  lastShareDate: null,
  transactions: [],
};

interface CreditPayload {
  amount: number;
  reason: string;
  relatedGameId?: string;
}

interface DebitPayload {
  amount: number;
  reason: string;
  relatedGameId?: string;
}

interface SharePayload {
  amount: number;
  recipientName: string;
  note?: string;
  timestamp: string;
}

function rolloverDailyShareIfNeeded(state: WalletState, timestamp: string) {
  if (!state.lastShareDate || !isSameCalendarDay(state.lastShareDate, timestamp)) {
    state.sharedToday = 0;
  }
}

const walletSlice = createSlice({
  name: "wallet",
  initialState,
  reducers: {
    coinsCredited(state, action: PayloadAction<CreditPayload>) {
      const amount = clampNonNegative(action.payload.amount);
      if (amount === 0) return;
      state.balance += amount;
      state.transactions.unshift({
        id: createId("txn"),
        type: TransactionType.AdministrativeCredit,
        amount,
        reason: action.payload.reason,
        createdAt: new Date().toISOString(),
        relatedGameId: action.payload.relatedGameId,
      });
    },
    coinsDebited(state, action: PayloadAction<DebitPayload>) {
      const amount = clampNonNegative(action.payload.amount);
      if (amount === 0 || amount > state.balance) return;
      state.balance -= amount;
      state.transactions.unshift({
        id: createId("txn"),
        type: TransactionType.GameSpend,
        amount,
        reason: action.payload.reason,
        createdAt: new Date().toISOString(),
        relatedGameId: action.payload.relatedGameId,
      });
    },
    coinsShared(state, action: PayloadAction<SharePayload>) {
      const { amount, recipientName, note, timestamp } = action.payload;
      const safeAmount = clampNonNegative(amount);
      rolloverDailyShareIfNeeded(state, timestamp);

      const remainingDaily = state.dailyShareLimit - state.sharedToday;
      if (safeAmount === 0 || safeAmount > state.balance || safeAmount > remainingDaily) {
        return;
      }

      state.balance -= safeAmount;
      state.sharedToday += safeAmount;
      state.lastShareDate = timestamp;
      state.transactions.unshift({
        id: createId("txn"),
        type: TransactionType.ShareSent,
        amount: safeAmount,
        reason: note?.trim() ? note.trim() : `Shared with ${recipientName}`,
        createdAt: timestamp,
        counterpartyName: recipientName,
      });
    },
    walletReplaced(_state, action: PayloadAction<WalletState>) {
      return action.payload;
    },
    walletReset() {
      return initialState;
    },
  },
});

export const { coinsCredited, coinsDebited, coinsShared, walletReplaced, walletReset } = walletSlice.actions;
export const walletReducer = walletSlice.reducer;
export const walletInitialState = initialState;
