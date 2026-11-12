import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { GameRegistration } from "@shared/types";

interface GameRegistrationsState {
  items: GameRegistration[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

const initialState: GameRegistrationsState = {
  items: [],
  status: "idle",
  error: null,
};

const gameRegistrationsSlice = createSlice({
  name: "gameRegistrations",
  initialState,
  reducers: {
    registrationsLoading(state) {
      state.status = "loading";
      state.error = null;
    },
    registrationsLoaded(state, action: PayloadAction<GameRegistration[]>) {
      state.items = action.payload;
      state.status = "ready";
      state.error = null;
    },
    registrationCreated(state, action: PayloadAction<GameRegistration>) {
      state.items = [action.payload, ...state.items];
      state.status = "ready";
      state.error = null;
    },
    registrationUpdated(state, action: PayloadAction<GameRegistration>) {
      state.items = state.items.map((item) =>
        item.appKey === action.payload.appKey ? action.payload : item,
      );
      state.status = "ready";
      state.error = null;
    },
    registrationDeleted(state, action: PayloadAction<string>) {
      state.items = state.items.filter(
        (item) => item.appKey !== action.payload,
      );
      state.status = "ready";
      state.error = null;
    },
    registrationsLoadFailed(state, action: PayloadAction<string>) {
      state.status = "error";
      state.error = action.payload;
    },
  },
});

export const {
  registrationsLoading,
  registrationsLoaded,
  registrationCreated,
  registrationUpdated,
  registrationDeleted,
  registrationsLoadFailed,
} = gameRegistrationsSlice.actions;
export const gameRegistrationsReducer = gameRegistrationsSlice.reducer;
export const gameRegistrationsInitialState = initialState;
