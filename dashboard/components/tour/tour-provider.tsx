"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { tourSteps, TOUR_STORAGE_KEY } from "./tour-config";

interface TourContextValue {
    restartTour: () => void;
    isTourActive: boolean;
}

const TourContext = React.createContext<TourContextValue | null>(null);

function isTourCompleted(): boolean {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(TOUR_STORAGE_KEY) === "true";
}

function markTourCompleted(): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TOUR_STORAGE_KEY, "true");
}

/**
 * Check if the current pathname is the dashboard page.
 * Handles both bare `/dashboard` and basePath-prefixed like `/dashboard/dashboard`.
 */
function isDashboardPath(pathname: string): boolean {
    return pathname === "/dashboard" || pathname.endsWith("/dashboard");
}

export function TourProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const driverRef = React.useRef<Driver | null>(null);
    const [isTourActive, setIsTourActive] = React.useState(false);
    const hasAutoStarted = React.useRef(false);

    const createDriver = React.useCallback(() => {
        const driverInstance = driver({
            showProgress: true,
            animate: true,
            allowClose: true,
            overlayColor: "rgba(0, 0, 0, 0.65)",
            stagePadding: 8,
            stageRadius: 8,
            popoverClass: "simplens-tour-popover",
            nextBtnText: "Next →",
            prevBtnText: "← Back",
            doneBtnText: "Finish Tour ✓",
            progressText: "{{current}} of {{total}}",
            steps: tourSteps,
            onDestroyed: () => {
                markTourCompleted();
                setIsTourActive(false);
                driverRef.current = null;
            },
        });

        return driverInstance;
    }, []);

    const startTour = React.useCallback(
        (forceRestart = false) => {
            // Clean up previous instance
            if (driverRef.current) {
                driverRef.current.destroy();
                driverRef.current = null;
            }

            if (forceRestart) {
                window.localStorage.removeItem(TOUR_STORAGE_KEY);
            }

            // Small delay to ensure DOM elements are rendered
            setTimeout(() => {
                const driverInstance = createDriver();
                driverRef.current = driverInstance;
                setIsTourActive(true);
                driverInstance.drive();
            }, 800);
        },
        [createDriver]
    );

    // Auto-start on first visit to dashboard
    React.useEffect(() => {
        if (isDashboardPath(pathname) && !isTourCompleted() && !hasAutoStarted.current) {
            hasAutoStarted.current = true;
            startTour();
        }
    }, [pathname, startTour]);

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            if (driverRef.current) {
                driverRef.current.destroy();
                driverRef.current = null;
            }
        };
    }, []);

    const restartTour = React.useCallback(() => {
        if (!isDashboardPath(pathname)) {
            // Navigate to dashboard first, then start tour
            window.localStorage.removeItem(TOUR_STORAGE_KEY);
            hasAutoStarted.current = false;
            router.push("/dashboard");
        } else {
            startTour(true);
        }
    }, [pathname, router, startTour]);

    const contextValue = React.useMemo(
        () => ({
            restartTour,
            isTourActive,
        }),
        [restartTour, isTourActive]
    );

    return (
        <TourContext.Provider value={contextValue}>
            {children}
        </TourContext.Provider>
    );
}

export function useTour() {
    const context = React.useContext(TourContext);
    if (!context) {
        throw new Error("useTour must be used within a TourProvider");
    }
    return context;
}
