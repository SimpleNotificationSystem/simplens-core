"use client";

import { AlertTriangle, AlertCircle, XCircle, Bell, Check, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { ALERT_SEVERITY, ALERT_TYPE, type AlertResponse } from "@/lib/types/alert";

interface AlertCardProps {
    alert: AlertResponse;
    onResolve?: (alertId: string) => void;
    isResolving?: boolean;
}

const severityConfig = {
    [ALERT_SEVERITY.warning]: {
        icon: AlertTriangle,
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/20",
        badgeVariant: "outline" as const,
    },
    [ALERT_SEVERITY.error]: {
        icon: AlertCircle,
        color: "text-orange-500",
        bgColor: "bg-orange-500/10",
        borderColor: "border-orange-500/20",
        badgeVariant: "destructive" as const,
    },
    [ALERT_SEVERITY.critical]: {
        icon: XCircle,
        color: "text-red-500",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/20",
        badgeVariant: "destructive" as const,
    },
};

const typeLabels: Record<ALERT_TYPE, string> = {
    [ALERT_TYPE.stuck_processing]: "Stuck Processing",
    [ALERT_TYPE.ghost_delivery]: "Ghost Delivery",
    [ALERT_TYPE.orphaned_pending]: "Orphaned Pending",
    [ALERT_TYPE.recovery_error]: "Recovery Error",
};

export function AlertCard({ alert, onResolve, isResolving }: AlertCardProps) {
    const config = severityConfig[alert.severity];
    const Icon = config.icon;

    return (
        <Card className={cn(
            "transition-all duration-200 hover:shadow-md",
            config.borderColor,
            alert.resolved && "opacity-60"
        )}>
            <CardContent className="p-4">
                <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={cn(
                        "p-2 rounded-lg shrink-0",
                        config.bgColor
                    )}>
                        <Icon className={cn("h-5 w-5", config.color)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                                {typeLabels[alert.type]}
                            </Badge>
                            <Badge
                                variant={config.badgeVariant}
                                className="text-xs capitalize"
                            >
                                {alert.severity}
                            </Badge>
                            {alert.resolved && (
                                <Badge variant="secondary" className="text-xs">
                                    <Check className="h-3 w-3 mr-1" />
                                    Resolved
                                </Badge>
                            )}
                        </div>

                        <p className="text-sm font-medium text-foreground mb-1">
                            {alert.message}
                        </p>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>
                                {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                            </span>
                            {alert.notification_id && (
                                <span className="font-mono truncate max-w-[120px]">
                                    ID: {alert.notification_id}
                                </span>
                            )}
                            {alert.metadata && (
                                <span className="truncate">
                                    {Object.entries(alert.metadata)
                                        .slice(0, 2)
                                        .map(([k, v]) => `${k}: ${v}`)
                                        .join(", ")}
                                </span>
                            )}
                        </div>

                        {alert.resolved && alert.resolved_at && (
                            <p className="text-xs text-muted-foreground mt-2">
                                Resolved {formatDistanceToNow(new Date(alert.resolved_at), { addSuffix: true })}
                                {alert.resolved_by && ` by ${alert.resolved_by}`}
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        {alert.notification_id && (
                            <Button
                                variant="ghost"
                                size="sm"
                                asChild
                            >
                                <a href={`/events/${alert.notification_id}`}>
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            </Button>
                        )}
                        {!alert.resolved && onResolve && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onResolve(alert._id)}
                                disabled={isResolving}
                            >
                                <Check className="h-4 w-4 mr-1" />
                                Resolve
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

interface AlertSummaryProps {
    counts: {
        warning: number;
        error: number;
        critical: number;
        total: number;
    };
}

export function AlertSummary({ counts }: AlertSummaryProps) {
    return (
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">{counts.total} Active Alerts</span>
            </div>
            <div className="flex items-center gap-3 ml-auto">
                {counts.critical > 0 && (
                    <div className="flex items-center gap-1">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm">{counts.critical} Critical</span>
                    </div>
                )}
                {counts.error > 0 && (
                    <div className="flex items-center gap-1">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-sm">{counts.error} Error</span>
                    </div>
                )}
                {counts.warning > 0 && (
                    <div className="flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm">{counts.warning} Warning</span>
                    </div>
                )}
                {counts.total === 0 && (
                    <span className="text-sm text-muted-foreground">All clear! 🎉</span>
                )}
            </div>
        </div>
    );
}
