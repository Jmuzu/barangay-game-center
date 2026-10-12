"use client";

import { ReactNode, useEffect, useState } from "react";
import { Provider } from "react-redux";
import { makeStore, RootState } from "./store";
import { subscribeForPersistence } from "./persistenceSubscription";

interface StoreProviderProps {
  children: ReactNode;
}

export function StoreProvider({ children }: StoreProviderProps) {
  const [store, setStore] = useState(() => makeStore(undefined, false));
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Parent platform session required"))))
      .then(() => fetch("/api/state", { cache: "no-store" }))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Player state unavailable"))))
      .then(async (state: Partial<RootState>) => {
        if (cancelled) return;
        const registrationsResponse = await fetch("/api/game-registrations");
        const registrations = registrationsResponse.ok ? await registrationsResponse.json() : [];
        const missionsResponse = await fetch("/api/missions", { cache: "no-store" });
        const missions = missionsResponse.ok ? await missionsResponse.json() : state.missions;
        setStore(makeStore({
          ...state,
          missions,
          gameRegistrations: { items: registrations, status: "ready", error: null },
        }));
        setIsHydrated(true);
      })
      .catch(() => {
        if (!cancelled) window.location.replace("/auth/required");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    return subscribeForPersistence(store);
  }, [isHydrated, store]);

  return <Provider store={store}>{children}</Provider>;
}
