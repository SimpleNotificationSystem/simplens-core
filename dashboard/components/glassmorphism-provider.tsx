"use client";

import * as React from "react";

const GLASSMORPHISM_STORAGE_KEY = "simplens-dashboard-glassmorphism";

interface GlassmorphismContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const GlassmorphismContext = React.createContext<GlassmorphismContextValue | null>(null);

function readStoredValue() {
  if (typeof window === "undefined") {
    return true;
  }

  const stored = window.localStorage.getItem(GLASSMORPHISM_STORAGE_KEY);
  if (stored === null) {
    return true;
  }

  return stored === "true";
}

export function GlassmorphismProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = React.useState<boolean>(true);

  React.useEffect(() => {
    setEnabled(readStoredValue());
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const value = enabled ? "on" : "off";
    document.documentElement.setAttribute("data-glassmorphism", value);
    document.body.setAttribute("data-glassmorphism", value);
    window.localStorage.setItem(GLASSMORPHISM_STORAGE_KEY, String(enabled));
  }, [enabled]);

  const contextValue = React.useMemo(
    () => ({
      enabled,
      setEnabled,
    }),
    [enabled]
  );

  return (
    <GlassmorphismContext.Provider value={contextValue}>
      {children}
      <div
        aria-hidden="true"
        className="glassmorphism-layer pointer-events-none fixed inset-0 z-30 opacity-0 transition-opacity duration-300"
      />
    </GlassmorphismContext.Provider>
  );
}

export function useGlassmorphism() {
  const context = React.useContext(GlassmorphismContext);

  if (!context) {
    throw new Error("useGlassmorphism must be used within a GlassmorphismProvider");
  }

  return context;
}
