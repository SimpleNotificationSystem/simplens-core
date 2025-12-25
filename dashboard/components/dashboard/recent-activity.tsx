"use client";

import useSWR from "swr";
import Link from "next/link";
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
                <div className="flex flex-col gap-1">
                    {notifications.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No notifications yet</p>
                    ) : (
                        notifications.map((notification) => (
                            <Link
                                key={notification._id}
                                href={`/events/${notification._id}`}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 hover:bg-muted/50 rounded-md p-2 transition-colors cursor-pointer"
                            >
                                <div className="flex flex-col gap-1 min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <ChannelBadge channel={notification.channel} />
                                        <span className="text-sm font-medium truncate">
                                            {String(notification.recipient.email || notification.recipient.phone || notification.recipient.user_id || '')}
                                        </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                    </span>
                                </div>
                                <StatusBadge status={notification.status} />
                            </Link>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
