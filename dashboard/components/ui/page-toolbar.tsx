"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageToolbarProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * A consistent toolbar component for page actions (filters, buttons, etc.)
 * Place this directly below the DashboardLayout header.
 */
export function PageToolbar({ children, className }: PageToolbarProps) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-2 pb-4 border-b mb-6",
                className
            )}
        >
            {children}
        </div>
    );
}

interface PageToolbarSectionProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * A section within the toolbar - use for grouping related controls
 */
export function PageToolbarSection({ children, className }: PageToolbarSectionProps) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            {children}
        </div>
    );
}

/**
 * A spacer that pushes content to the right
 */
export function PageToolbarSpacer() {
    return <div className="flex-1" />;
}
