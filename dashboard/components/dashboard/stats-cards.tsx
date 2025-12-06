"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCircle, Clock, AlertTriangle, Mail, MessageCircle, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface StatsCardConfig {
    title: string;
    value: string;
    description: string;
    icon: LucideIcon;
    iconColor: string;
    gradientClass: string;
    bgIconColor: string;
}

// Reusable Stats Card component with gradient background and large icon
function StatsCard({ card }: { card: StatsCardConfig }) {
    return (
        <Card className={cn(
            "relative overflow-hidden border-0 shadow-sm",
            "bg-gradient-to-br",
            card.gradientClass
        )}>
            {/* Large background icon */}
            <card.icon
                className={cn(
                    "absolute -bottom-1 -right-1 h-24 w-24 rotate-10",
                    card.bgIconColor
                )}
            />

            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2 relative z-10">
                <card.icon className={cn("h-5 w-5", card.iconColor)} />
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            </CardHeader>

            <CardContent className="relative z-10">
                <div className="text-4xl font-bold tracking-tight">{card.value}</div>
                <p className="text-sm text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
        </Card>
    );
}

// Loading skeleton with gradient placeholder
function StatsCardSkeleton() {
    return (
        <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-10 w-20" />
                <Skeleton className="mt-2 h-4 w-36" />
            </CardContent>
        </Card>
    );
}

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
                    <StatsCardSkeleton key={i} />
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

    const cards: StatsCardConfig[] = [
        {
            title: "Total Notifications",
            value: stats.total.toLocaleString(),
            description: `${stats.byChannel.email} email, ${stats.byChannel.whatsapp} WhatsApp`,
            icon: Bell,
            iconColor: "text-blue-600 dark:text-blue-400",
            gradientClass: "from-white to-blue-100 dark:from-blue-950/50 dark:to-blue-900",
            bgIconColor: "text-blue-500/10 dark:text-blue-400/10",
        },
        {
            title: "Delivered",
            value: stats.delivered.toLocaleString(),
            description: `${deliveryRate}% delivery rate`,
            icon: CheckCircle,
            iconColor: "text-green-600 dark:text-green-400",
            gradientClass: "from-white to-green-100 dark:from-green-950/50 dark:to-green-900",
            bgIconColor: "text-green-500/10 dark:text-green-400/10",
        },
        {
            title: "Pending / Processing",
            value: (stats.pending + stats.processing).toLocaleString(),
            description: `${stats.pending} pending, ${stats.processing} processing`,
            icon: Clock,
            iconColor: "text-amber-600 dark:text-amber-400",
            gradientClass: "from-white to-yellow-200 dark:from-yellow-950/50 dark:to-yellow-900",
            bgIconColor: "text-amber-500/10 dark:text-amber-400/10",
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
                <StatsCard key={card.title} card={card} />
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
                    <StatsCardSkeleton key={i} />
                ))}
            </div>
        );
    }

    if (error || !stats) {
        return null;
    }

    const cards: StatsCardConfig[] = [
        {
            title: "Failed",
            value: stats.failed.toLocaleString(),
            description: stats.failed > 0 ? "Requires attention" : "All clear",
            icon: AlertTriangle,
            iconColor: stats.failed > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
            gradientClass: stats.failed > 0
                ? "from-white to-red-200 dark:from-red-950/50 dark:to-red-900"
                : "from-white to-gray-100 dark:from-gray-900/50 dark:to-gray-800",
            bgIconColor: stats.failed > 0
                ? "text-red-500/10 dark:text-red-400/10"
                : "text-gray-500/10 dark:text-gray-400/10",
        },
        {
            title: "Email",
            value: stats.byChannel.email.toLocaleString(),
            description: "Total Notifications",
            icon: Mail,
            iconColor: "text-purple-600 dark:text-purple-400",
            gradientClass: "from-white to-purple-100 dark:from-purple-950/50 dark:to-purple-900",
            bgIconColor: "text-purple-500/10 dark:text-purple-400/10",
        },
        {
            title: "WhatsApp",
            value: stats.byChannel.whatsapp.toLocaleString(),
            description: "Total Notifications",
            icon: MessageCircle,
            iconColor: "text-emerald-600 dark:text-emerald-400",
            gradientClass: "from-white to-emerald-100 dark:from-emerald-950/50 dark:to-emerald-900",
            bgIconColor: "text-emerald-500/10 dark:text-emerald-400/10",
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
                <StatsCard key={card.title} card={card} />
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
