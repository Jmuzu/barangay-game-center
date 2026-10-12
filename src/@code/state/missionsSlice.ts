import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { MissionStatus } from "@shared/enums";
import type { Mission } from "@shared/types";
import { clampNonNegative } from "@shared/utils";
const initialState: Mission[] = [];

const missionsSlice = createSlice({
  name: "missions",
  initialState,
  reducers: {
    missionBonusUpdated(state, action: PayloadAction<{ missionId: string; bonusCoins: number }>) {
      const mission = state.find((candidate) => candidate.id === action.payload.missionId);
      const bonusCoins = clampNonNegative(action.payload.bonusCoins);
      if (!mission || bonusCoins === 0) return;
      mission.bonusCoins = bonusCoins;
    },
    missionStatusToggled(state, action: PayloadAction<{ missionId: string }>) {
      const mission = state.find((candidate) => candidate.id === action.payload.missionId);
      if (!mission) return;
      mission.status = mission.status === MissionStatus.Active ? MissionStatus.Inactive : MissionStatus.Active;
    },
    missionReplaced(state, action: PayloadAction<Mission>) {
      const index = state.findIndex((mission) => mission.id === action.payload.id);
      if (index >= 0) state[index] = action.payload;
    },
    missionsReset() {
      return initialState;
    },
  },
});

export const { missionBonusUpdated, missionStatusToggled, missionReplaced, missionsReset } = missionsSlice.actions;
export const missionsReducer = missionsSlice.reducer;
export const missionsInitialState = initialState;
