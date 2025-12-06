"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/events/status-badge";
import { ChannelBadge } from "@/components/events/channel-badge";
import type { Notification } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function RecentActivity() {
    const { data: notifications, isLoading, error } = useSWR<Notification[]>(
        "/api/notifications/recent?limit=8",
        fetcher,
        { refreshInterval: 10000 } // Refresh every 10 seconds
    );

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <Skeleton className="h-10 w-10 rounded-full" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error || !notifications) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Failed to load recent activity</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {notifications.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No notifications yet</p>
                    ) : (
                        notifications.map((notification) => (
                            <div
                                key={notification._id}
                                className="flex items-center justify-between gap-4 border-b pb-4 last:border-0 last:pb-0"
                            >
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <ChannelBadge channel={notification.channel} />
                                        <span className="text-sm font-medium truncate max-w-[200px]">
                                            {notification.recipient.email || notification.recipient.phone}
                                        </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                    </span>
                                </div>
                                <StatusBadge status={notification.status} />
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
