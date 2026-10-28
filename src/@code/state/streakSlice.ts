import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { StreakState } from "@shared/types";
import { computeStreakUpdate } from "@shared/helpers";

const initialState: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedDate: null,
  claimedMilestoneDays: [],
};

const streakSlice = createSlice({
  name: "streak",
  initialState,
  reducers: {
    gamePlayed(state, action: PayloadAction<{ timestamp: string }>) {
      const { streak } = computeStreakUpdate({
        currentStreak: state.currentStreak,
        lastPlayedDate: state.lastPlayedDate,
        now: action.payload.timestamp,
      });
      state.currentStreak = streak;
      state.longestStreak = Math.max(state.longestStreak, streak);
      state.lastPlayedDate = action.payload.timestamp;
    },
    milestoneClaimed(state, action: PayloadAction<{ days: number }>) {
      if (!state.claimedMilestoneDays.includes(action.payload.days)) {
        state.claimedMilestoneDays.push(action.payload.days);
      }
    },
    streakReplaced(_state, action: PayloadAction<StreakState>) {
      return action.payload;
    },
    streakReset() {
      return initialState;
    },
  },
});

export const { gamePlayed, milestoneClaimed, streakReplaced, streakReset } = streakSlice.actions;
export const streakReducer = streakSlice.reducer;
export const streakInitialState = initialState;
