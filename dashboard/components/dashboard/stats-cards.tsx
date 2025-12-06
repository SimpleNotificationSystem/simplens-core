"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCircle, Clock, AlertTriangle, Mail, MessageCircle } from "lucide-react";
import type { DashboardStats } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Row 1: Total Notifications | Delivered | Pending/Processing
export function StatsRowOne() {
    const { data: stats, isLoading, error } = useSWR<DashboardStats>(
        "/api/dashboard/stats",
        fetcher,
        { refreshInterval: 30000 }
    );

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-4" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-16" />
                            <Skeleton className="mt-1 h-3 w-32" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="text-center text-muted-foreground">
                Failed to load statistics
            </div>
        );
    }

    const deliveryRate = stats.total > 0
        ? ((stats.delivered / stats.total) * 100).toFixed(1)
        : "0";

    const cards = [
        {
            title: "Total Notifications",
            value: stats.total.toLocaleString(),
            description: `${stats.byChannel.email} email, ${stats.byChannel.whatsapp} WhatsApp`,
            icon: Bell,
            iconColor: "text-blue-500",
        },
        {
            title: "Delivered",
            value: stats.delivered.toLocaleString(),
            description: `${deliveryRate}% delivery rate`,
            icon: CheckCircle,
            iconColor: "text-green-500",
        },
        {
            title: "Pending / Processing",
            value: (stats.pending + stats.processing).toLocaleString(),
            description: `${stats.pending} pending, ${stats.processing} processing`,
            icon: Clock,
            iconColor: "text-yellow-500",
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
                <Card key={card.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                        <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{card.value}</div>
                        <p className="text-xs text-muted-foreground">{card.description}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// Row 2: Failed | Email | WhatsApp
export function StatsRowTwo() {
    const { data: stats, isLoading, error } = useSWR<DashboardStats>(
        "/api/dashboard/stats",
        fetcher,
        { refreshInterval: 30000 }
    );

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-4" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-16" />
                            <Skeleton className="mt-1 h-3 w-32" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (error || !stats) {
        return null;
    }

    const cards = [
        {
            title: "Failed",
            value: stats.failed.toLocaleString(),
            description: stats.failed > 0 ? "Requires attention" : "All clear",
            icon: AlertTriangle,
            iconColor: stats.failed > 0 ? "text-red-500" : "text-muted-foreground",
        },
        {
            title: "Email",
            value: stats.byChannel.email.toLocaleString(),
            description: "total notifications",
            icon: Mail,
            iconColor: "text-purple-500",
        },
        {
            title: "WhatsApp",
            value: stats.byChannel.whatsapp.toLocaleString(),
            description: "total notifications",
            icon: MessageCircle,
            iconColor: "text-emerald-500",
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
                <Card key={card.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                        <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{card.value}</div>
                        <p className="text-xs text-muted-foreground">{card.description}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// Legacy exports for backwards compatibility
export function StatsCards() {
    return <StatsRowOne />;
}

export function ChannelCards() {
    return <StatsRowTwo />;
}
