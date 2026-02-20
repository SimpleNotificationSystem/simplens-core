"use client";

import * as React from "react";

const SIDEBAR_PIN_STORAGE_KEY = "sidebar_pin_state";

interface SidebarPinContextValue {
  isPinned: boolean;
  setIsPinned: (value: boolean | ((current: boolean) => boolean)) => void;
}

const SidebarPinContext = React.createContext<SidebarPinContextValue | null>(null);

export function SidebarPinProvider({ children }: { children: React.ReactNode }) {
  const [isPinned, setIsPinned] = React.useState(true);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_PIN_STORAGE_KEY);
    if (stored !== null) {
      setIsPinned(stored === "true");
    }
  }, []);

  React.useEffect(() => {
    window.localStorage.setItem(SIDEBAR_PIN_STORAGE_KEY, String(isPinned));
  }, [isPinned]);

  const value = React.useMemo(
    () => ({
      isPinned,
      setIsPinned,
    }),
    [isPinned]
  );

  return <SidebarPinContext.Provider value={value}>{children}</SidebarPinContext.Provider>;
}

export function useSidebarPin() {
  const context = React.useContext(SidebarPinContext);
  if (!context) {
    throw new Error("useSidebarPin must be used within a SidebarPinProvider");
  }

  return context;
}
