"use client";

import useSWR from "swr";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Bell, CheckCircle, Clock, AlertTriangle, Mail, MessageCircle,
    ShieldAlert, LucideIcon, Activity, Smartphone, Zap
} from "lucide-react";
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
    href?: string;
    className?: string; // For grid span overrides
}

// Deterministic color generator for dynamic channels
const getChannelStyle = (channel: string) => {
    const styles = [
        {
            iconColor: "text-purple-600 dark:text-purple-300",
            gradientClass: "from-purple-100 to-purple-200 dark:from-purple-900/60 dark:to-purple-800/60",
            bgIconColor: "text-purple-500/20 dark:text-purple-400/20",
        },
        {
            iconColor: "text-pink-600 dark:text-pink-300",
            gradientClass: "from-pink-100 to-pink-200 dark:from-pink-900/60 dark:to-pink-800/60",
            bgIconColor: "text-pink-500/20 dark:text-pink-400/20",
        },
        {
            iconColor: "text-indigo-600 dark:text-indigo-300",
            gradientClass: "from-indigo-100 to-indigo-200 dark:from-indigo-900/60 dark:to-indigo-800/60",
            bgIconColor: "text-indigo-500/20 dark:text-indigo-400/20",
        },
        {
            iconColor: "text-teal-600 dark:text-teal-300",
            gradientClass: "from-teal-100 to-teal-200 dark:from-teal-900/60 dark:to-teal-800/60",
            bgIconColor: "text-teal-500/20 dark:text-teal-400/20",
        }
    ];

    // Hash string to index
    let hash = 0;
    for (let i = 0; i < channel.length; i++) {
        hash = channel.charCodeAt(i) + ((hash << 5) - hash);
    }

    return styles[Math.abs(hash) % styles.length];
};

function StatsCard({ card }: { card: StatsCardConfig }) {
    const isLarge = card.className?.includes("row-span-2");

    const Content = (
        <Card className={cn(
            "relative overflow-hidden border-0 shadow-sm h-full transition-all duration-200",
            "bg-linear-to-br hover:shadow-md",
            card.gradientClass,
            card.className
        )}>
            {/* Abstract Background Decoration */}
            <div className={cn(
                "absolute -right-6 -bottom-6 rounded-full opacity-20 blur-2xl",
                card.bgIconColor.replace("text-", "bg-"),
                isLarge ? "h-48 w-48" : "h-32 w-32"
            )} />

            <card.icon
                className={cn(
                    "absolute -bottom-2 -right-2 rotate-12 opacity-10 transition-transform group-hover:scale-110 duration-500",
                    card.iconColor,
                    isLarge ? "h-32 w-32" : "h-24 w-24"
                )}
            />

            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2 relative z-10">
                <div className={cn("p-2 rounded-lg bg-white/50 dark:bg-black/20 backdrop-blur-sm", card.iconColor)}>
                    <card.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-sm font-medium text-foreground/80">{card.title}</CardTitle>
            </CardHeader>

            <CardContent className={cn("relative z-10 pt-2", isLarge && "flex flex-col justify-center flex-1")}>
                <div className={cn("font-bold tracking-tight", isLarge ? "text-5xl" : "text-3xl")}>{card.value}</div>
                <p className="text-xs font-medium text-muted-foreground mt-2 flex items-center gap-1">
                    {card.description}
                </p>
            </CardContent>
        </Card>
    );

    if (card.href) {
        return <Link href={card.href} className={cn("block group h-full", card.className)}>{Content}</Link>;
    }

    return <div className={cn("h-full group", card.className)}>{Content}</div>;
}

function StatsCardSkeleton({ className }: { className?: string }) {
    return (
        <Card className={cn("h-32", className)}>
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
            </CardContent>
        </Card>
    );
}

export function StatsGrid() {
    const { data: stats, isLoading: statsLoading, error: statsError } = useSWR<DashboardStats>(
        "/api/dashboard/stats",
        fetcher,
        { refreshInterval: 10000 }
    );

    const { data: alertStats, isLoading: alertsLoading } = useSWR<{ count: number }>(
        "/api/alerts",
        fetcher,
        { refreshInterval: 10000 }
    );

    const isLoading = statsLoading || alertsLoading;

    if (isLoading) {
        return (
            <div className="space-y-8">
                <div className="grid gap-4 grid-cols-1 md:grid-cols-3 md:grid-rows-2 h-[300px]">
                    <div className="md:row-span-2"><StatsCardSkeleton className="h-full" /></div>
                    <StatsCardSkeleton /><StatsCardSkeleton />
                    <StatsCardSkeleton /><StatsCardSkeleton />
                </div>
                <div className="h-40 bg-muted/10 rounded-xl animate-pulse" />
            </div>
        );
    }

    if (statsError || !stats) return <div className="text-red-500">Failed to load stats</div>;

    const alertCount = alertStats?.count ?? 0;
    const deliveryRate = stats.total > 0 ? ((stats.delivered / stats.total) * 100).toFixed(1) : "0";

    // Fixed Cards Configuration
    const fixedCards: StatsCardConfig[] = [
        {
            title: "Total Notifications",
            value: stats.total.toLocaleString(),
            description: `Total notifications`,
            icon: Bell,
            iconColor: "text-blue-600 dark:text-blue-400",
            gradientClass: "from-white to-blue-100 dark:from-blue-950/50 dark:to-blue-900",
            bgIconColor: "text-blue-500/10 dark:text-blue-400/10",
            className: "md:row-span-2 h-full"
        },
        {
            title: "Alerts",
            value: alertCount.toLocaleString(),
            description: alertCount > 0 ? "Require attention" : "All clear",
            icon: ShieldAlert,
            iconColor: alertCount > 0 ? "text-orange-600 dark:text-orange-400" : "text-cyan-600 dark:text-cyan-400",
            gradientClass: alertCount > 0
                ? "from-white to-orange-200 dark:from-orange-950/50 dark:to-orange-900"
                : "from-white to-cyan-100 dark:from-cyan-950/50 dark:to-cyan-900",
            bgIconColor: alertCount > 0
                ? "text-orange-500/10 dark:text-orange-400/10"
                : "text-cyan-500/10 dark:text-cyan-400/10",
            href: "/alerts",
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
        {
            title: "Failed",
            value: stats.failed.toLocaleString(),
            description: stats.failed > 0 ? "Requires attention" : "All clear",
            icon: AlertTriangle,
            iconColor: stats.failed > 0 ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400",
            gradientClass: stats.failed > 0
                ? "from-white to-red-200 dark:from-red-950/50 dark:to-red-900"
                : "from-white to-slate-100 dark:from-slate-900/50 dark:to-slate-800",
            bgIconColor: stats.failed > 0
                ? "text-red-500/10 dark:text-red-400/10"
                : "text-slate-500/10 dark:text-slate-400/10",
            href: "/failed",
        },
    ];

    // Dynamic Channel Cards
    const channelCards: StatsCardConfig[] = Object.entries(stats.byChannel).map(([channel, count]) => {
        // Specific overrides for known plugins
        const isEmail = channel === 'email';
        const isWhatsapp = channel === 'whatsapp';
        const isSms = channel === 'sms';

        let style;
        let icon = Zap;

        if (isEmail) {
            icon = Mail;
            style = {
                iconColor: "text-violet-600 dark:text-violet-300",
                gradientClass: "from-violet-100 to-violet-200 dark:from-violet-900/60 dark:to-violet-800/60",
                bgIconColor: "text-violet-600",
            };
        } else if (isWhatsapp) {
            icon = MessageCircle;
            style = {
                iconColor: "text-emerald-600 dark:text-emerald-300",
                gradientClass: "from-emerald-100 to-emerald-200 dark:from-emerald-900/60 dark:to-emerald-800/60",
                bgIconColor: "text-emerald-600",
            };
        } else if (isSms) {
            icon = Smartphone;
            style = {
                iconColor: "text-sky-600 dark:text-sky-300",
                gradientClass: "from-sky-100 to-sky-200 dark:from-sky-900/60 dark:to-sky-800/60",
                bgIconColor: "text-sky-600",
            };
        } else {
            // Generative style for unknown plugins
            const genStyle = getChannelStyle(channel);
            style = {
                iconColor: genStyle.iconColor,
                gradientClass: genStyle.gradientClass,
                bgIconColor: genStyle.bgIconColor.replace("/10", ""), // Clean up format
            };
        }

        const percentage = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : "0";

        return {
            title: channel.charAt(0).toUpperCase() + channel.slice(1),
            value: count.toLocaleString(),
            description: `${percentage}% of traffic`,
            icon,
            ...style
        };
    });

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Main Health Grid - 2x3 Layout */}
            <section>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-3 md:grid-rows-2">
                    {fixedCards.map((card, index) => (
                        <StatsCard key={card.title} card={card} />
                    ))}
                </div>
            </section>

            {/* Dynamic Channels - Horizontal Scroll */}
            <section>
                <h2 className="text-lg font-semibold tracking-tight mb-4 flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    Channels
                </h2>
                {channelCards.length > 0 ? (
                    <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                        {channelCards.map((card) => (
                            <div key={card.title} className="min-w-[260px] shrink-0">
                                <StatsCard card={card} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl bg-muted/20">
                        <Zap className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">No channels active yet.</p>
                        <p className="text-xs text-muted-foreground/60">Install plugins to see channel metrics.</p>
                    </div>
                )}
            </section>
        </div>
    );
}
