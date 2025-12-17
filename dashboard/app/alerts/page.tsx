"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    ShieldAlert,
    RefreshCw,
    Eye,
    RotateCcw,
    X,
    AlertTriangle,
    AlertCircle,
    Clock,
    ChevronDown,
    Filter,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert as AlertType, ALERT_TYPE } from "@/lib/types";

interface AlertWithNotification extends AlertType {
    notification?: {
        _id: string;
        request_id: string;
        channel: string;
        recipient: {
            user_id: string;
            email?: string;
            phone?: string;
        };
    };
}

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<AlertWithNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loadingMore, setLoadingMore] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [countsByType, setCountsByType] = useState<Record<string, number>>({});
    const [filterType, setFilterType] = useState<string>("all");

    const fetchAlerts = useCallback(async (pageNum = 1, append = false, type = "all") => {
        try {
            const response = await fetch(`/api/alerts?page=${pageNum}&limit=50&type=${type}`);
            const data = await response.json();

            if (append) {
                setAlerts(prev => [...prev, ...(data.alerts || [])]);
            } else {
                setAlerts(data.alerts || []);
            }

            setTotalCount(data.count || 0);
            setTotalPages(data.totalPages || 1);
            setCountsByType(data.byType || {});
            setPage(pageNum);
        } catch (error) {
            console.error("Failed to fetch alerts:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        fetchAlerts(1, false, filterType);
    }, [fetchAlerts, filterType]);

    const handleRefresh = () => {
        setRefreshing(true);
        setPage(1);
        fetchAlerts(1, false, filterType);
    };

    const handleLoadMore = () => {
        if (page < totalPages) {
            setLoadingMore(true);
            fetchAlerts(page + 1, true, filterType);
        }
    };

    const handleFilterChange = (type: string) => {
        setFilterType(type);
        setLoading(true);
        setPage(1);
        // fetchAlerts will be triggered by useEffect
    };

    const handleBulkRetry = async (appendWarning: boolean) => {
        if (totalCount === 0) return;

        setBulkLoading(true);
        try {
            const response = await fetch("/api/alerts/bulk-resolve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ appendWarning, limit: 100 }),
            });

            if (response.ok) {
                const data = await response.json();
                // Refresh the list after bulk action
                setPage(1);
                await fetchAlerts(1, false);
                toast.success(data.message);
            }
        } catch (error) {
            console.error("Failed to bulk retry:", error);
        } finally {
            setBulkLoading(false);
        }
    };

    const handleRetry = async (alertId: string, appendWarning: boolean) => {
        setActionLoading(alertId);
        try {
            const response = await fetch(`/api/alerts/${alertId}/resolve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ appendWarning }),
            });

            if (response.ok) {
                setAlerts((prev) => prev.filter((a) => a._id !== alertId));
                setTotalCount((prev) => Math.max(0, prev - 1));
            }
        } catch (error) {
            console.error("Failed to resolve alert:", error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDismiss = async (alertId: string) => {
        setActionLoading(alertId);
        try {
            const response = await fetch(`/api/alerts/${alertId}`, {
                method: "DELETE",
            });

            if (response.ok) {
                setAlerts((prev) => prev.filter((a) => a._id !== alertId));
                setTotalCount((prev) => Math.max(0, prev - 1));
            }
        } catch (error) {
            console.error("Failed to dismiss alert:", error);
        } finally {
            setActionLoading(null);
        }
    };

    const getAlertTypeInfo = (type: ALERT_TYPE) => {
        switch (type) {
            case ALERT_TYPE.ghost_delivery:
                return {
                    label: "Ghost Delivery",
                    icon: AlertCircle,
                    color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
                };
            case ALERT_TYPE.stuck_processing:
                return {
                    label: "Stuck Processing",
                    icon: AlertTriangle,
                    color: "bg-red-500/10 text-red-600 dark:text-red-400",
                };
            case ALERT_TYPE.orphaned_pending:
                return {
                    label: "Orphaned Pending",
                    icon: Clock,
                    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
                };
            default:
                return {
                    label: type,
                    icon: ShieldAlert,
                    color: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
                };
        }
    };

    return (
        <DashboardLayout title="Alerts">
            <div className="flex flex-1 flex-col gap-4 p-4">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <ShieldAlert className="h-6 w-6" />
                            Alerts
                        </h1>
                        <p className="text-muted-foreground">
                            Notifications requiring manual inspection
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {/* Filter Dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Filter className="h-4 w-4 mr-2" />
                                    {filterType === "all" ? "All Types" :
                                        filterType === ALERT_TYPE.ghost_delivery ? "Ghost Delivery" :
                                            filterType === ALERT_TYPE.stuck_processing ? "Stuck Processing" :
                                                filterType === ALERT_TYPE.orphaned_pending ? "Orphaned Pending" : "Filter"}
                                    <ChevronDown className="h-4 w-4 ml-1" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleFilterChange("all")}>
                                    <ShieldAlert className="h-4 w-4 mr-2" />
                                    All Types
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleFilterChange(ALERT_TYPE.ghost_delivery)}>
                                    <AlertCircle className="h-4 w-4 mr-2 text-yellow-600" />
                                    Ghost Delivery
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleFilterChange(ALERT_TYPE.stuck_processing)}>
                                    <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
                                    Stuck Processing
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleFilterChange(ALERT_TYPE.orphaned_pending)}>
                                    <Clock className="h-4 w-4 mr-2 text-orange-600" />
                                    Orphaned Pending
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Retry All Dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="default"
                                    size="sm"
                                    disabled={bulkLoading || totalCount === 0}
                                >
                                    {bulkLoading ? (
                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                    )}
                                    Retry All
                                    <ChevronDown className="h-4 w-4 ml-1" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleBulkRetry(false)}>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Retry All (up to 100)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleBulkRetry(true)}>
                                    <AlertTriangle className="h-4 w-4 mr-2" />
                                    Retry All with Warning
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={refreshing}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Summary Card */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold">{totalCount}</div>
                                <div className="text-sm text-muted-foreground">Total Alerts</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-yellow-600">
                                    {countsByType[ALERT_TYPE.ghost_delivery] || 0}
                                </div>
                                <div className="text-sm text-muted-foreground">Ghost Deliveries</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-red-600">
                                    {countsByType[ALERT_TYPE.stuck_processing] || 0}
                                </div>
                                <div className="text-sm text-muted-foreground">Stuck Processing</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-orange-600">
                                    {countsByType[ALERT_TYPE.orphaned_pending] || 0}
                                </div>
                                <div className="text-sm text-muted-foreground">Orphaned Pending</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Alerts List */}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : alerts.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-lg font-medium">No alerts</p>
                            <p className="text-sm text-muted-foreground">
                                All notifications are processing normally
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {alerts.map((alert) => {
                            const typeInfo = getAlertTypeInfo(alert.alert_type);
                            const TypeIcon = typeInfo.icon;
                            const isLoading = actionLoading === alert._id;

                            return (
                                <Card key={alert._id} className="flex flex-col">
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <Badge className={`${typeInfo.color} border-0`}>
                                                <TypeIcon className="h-3 w-3 mr-1" />
                                                {typeInfo.label}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(alert.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <CardTitle className="text-sm font-mono mt-2">
                                            {alert.notification_id}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex-1 flex flex-col gap-3">
                                        <CardDescription className="line-clamp-2">
                                            {alert.reason}
                                        </CardDescription>

                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                                <span className="text-muted-foreground">DB Status:</span>{" "}
                                                <Badge variant="outline" className="text-xs">
                                                    {alert.db_status}
                                                </Badge>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Redis:</span>{" "}
                                                <Badge variant="outline" className="text-xs">
                                                    {alert.redis_status || "N/A"}
                                                </Badge>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Retries:</span>{" "}
                                                {alert.retry_count}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="grid grid-cols-3 gap-2 mt-auto pt-3">
                                            <Link href={`/events/${alert.notification_id}`}>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full text-xs"
                                                    disabled={isLoading}
                                                >
                                                    <Eye className="h-3 w-3 mr-1" />
                                                    View
                                                </Button>
                                            </Link>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        className="w-full text-xs"
                                                        disabled={isLoading}
                                                    >
                                                        {isLoading ? (
                                                            <RefreshCw className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <RotateCcw className="h-3 w-3 mr-1" />
                                                                Retry
                                                                <ChevronDown className="h-3 w-3 ml-1" />
                                                            </>
                                                        )}
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="center">
                                                    <DropdownMenuItem
                                                        onClick={() => handleRetry(alert._id, false)}
                                                    >
                                                        <RotateCcw className="h-3 w-3 mr-2" />
                                                        Retry
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleRetry(alert._id, true)}
                                                    >
                                                        <AlertTriangle className="h-3 w-3 mr-2" />
                                                        Retry with Warning
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full text-xs"
                                                onClick={() => handleDismiss(alert._id)}
                                                disabled={isLoading}
                                            >
                                                <X className="h-3 w-3 mr-1" />
                                                Dismiss
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {/* Load More Button */}
                {!loading && alerts.length > 0 && page < totalPages && (
                    <div className="flex justify-center pt-4">
                        <Button
                            variant="outline"
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                        >
                            {loadingMore ? (
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : null}
                            Load More ({alerts.length} of {totalCount})
                        </Button>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
