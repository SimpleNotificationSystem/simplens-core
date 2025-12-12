"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { AlertCard, AlertSummary } from "./alert-card";
import { type AlertResponse } from "@/lib/types/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface AlertsApiResponse {
    data: AlertResponse[];
    counts: {
        warning: number;
        error: number;
        critical: number;
        total: number;
    };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function AlertsList() {
    const [showResolved, setShowResolved] = useState(false);
    const [resolvingId, setResolvingId] = useState<string | null>(null);

    const { data, isLoading, error, mutate: refreshAlerts } = useSWR<AlertsApiResponse>(
        `/api/alerts?resolved=${showResolved}`,
        fetcher,
        { refreshInterval: 30000 } // Refresh every 30 seconds
    );

    const handleResolve = async (alertId: string) => {
        setResolvingId(alertId);
        try {
            const response = await fetch("/api/alerts", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ alertId, resolved: true }),
            });

            if (!response.ok) throw new Error("Failed to resolve alert");

            toast.success("Alert resolved");
            refreshAlerts();
        } catch (err) {
            toast.error("Failed to resolve alert");
        } finally {
            setResolvingId(null);
        }
    };

    const handleResolveAll = async () => {
        if (!data?.data.length) return;

        const unresolvedAlerts = data.data.filter(a => !a.resolved);
        if (unresolvedAlerts.length === 0) return;

        try {
            await Promise.all(
                unresolvedAlerts.map(alert =>
                    fetch("/api/alerts", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ alertId: alert._id, resolved: true }),
                    })
                )
            );
            toast.success(`Resolved ${unresolvedAlerts.length} alerts`);
            refreshAlerts();
        } catch (err) {
            toast.error("Failed to resolve some alerts");
            refreshAlerts();
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-24 w-full" />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="p-6">
                    <p className="text-muted-foreground">Failed to load alerts</p>
                </CardContent>
            </Card>
        );
    }

    const alerts = data?.data || [];
    const counts = data?.counts || { warning: 0, error: 0, critical: 0, total: 0 };

    return (
        <div className="space-y-4">
            {/* Summary Card */}
            <AlertSummary counts={counts} />

            {/* Controls */}
            <div className="flex items-center justify-between">
                <Tabs
                    value={showResolved ? "resolved" : "active"}
                    onValueChange={(v) => setShowResolved(v === "resolved")}
                >
                    <TabsList>
                        <TabsTrigger value="active">
                            Active ({counts.total})
                        </TabsTrigger>
                        <TabsTrigger value="resolved">
                            Resolved
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="flex items-center gap-2">
                    {!showResolved && counts.total > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleResolveAll}
                        >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Resolve All
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refreshAlerts()}
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Alerts List */}
            <div className="space-y-3">
                {alerts.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center">
                            <p className="text-muted-foreground">
                                {showResolved
                                    ? "No resolved alerts"
                                    : "No active alerts - everything is running smoothly! 🎉"
                                }
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    alerts.map((alert) => (
                        <AlertCard
                            key={alert._id}
                            alert={alert}
                            onResolve={handleResolve}
                            isResolving={resolvingId === alert._id}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
