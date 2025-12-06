"use client";

import { NOTIFICATION_STATUS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
    status: NOTIFICATION_STATUS;
    className?: string;
}

const statusConfig = {
    [NOTIFICATION_STATUS.pending]: {
        label: "Pending",
        className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400",
    },
    [NOTIFICATION_STATUS.processing]: {
        label: "Processing",
        className: "bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
    },
    [NOTIFICATION_STATUS.delivered]: {
        label: "Delivered",
        className: "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400",
    },
    [NOTIFICATION_STATUS.failed]: {
        label: "Failed",
        className: "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400",
    },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
    const config = statusConfig[status];

    return (
        <Badge
            variant="secondary"
            className={cn(config.className, className)}
        >
            {config.label}
        </Badge>
    );
}
