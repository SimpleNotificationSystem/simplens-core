"use client";

import useSWR from "swr";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import type { DashboardStats } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const STATUS_COLORS = {
    pending: "#fbbf24",
    processing: "#3b82f6",
    delivered: "#22c55e",
    failed: "#ef4444",
};

// Dynamic channel colors with fallback
const getChannelColor = (channel: string, index: number): string => {
    const knownColors: Record<string, string> = {
        email: "#a855f7",
        whatsapp: "#10b981",
        sms: "#3b82f6",
    };
    const fallbackColors = ["#8b5cf6", "#06b6d4", "#f59e0b", "#ec4899", "#84cc16"];
    return knownColors[channel] || fallbackColors[index % fallbackColors.length];
};

export default function AnalyticsPage() {
    const { data: stats, isLoading } = useSWR<DashboardStats>(
        "/api/dashboard/stats",
        fetcher
    );

    if (isLoading) {
        return (
            <DashboardLayout title="Analytics" description="Insights and metrics">
                <div className="grid gap-6 md:grid-cols-2">
                    {[...Array(4)].map((_, i) => (
                        <Card key={i}>
                            <CardHeader>
                                <Skeleton className="h-6 w-32" />
                                <Skeleton className="h-4 w-48" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-64 w-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </DashboardLayout>
        );
    }

    if (!stats) {
        return (
            <DashboardLayout title="Analytics" description="Insights and metrics">
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        Failed to load analytics data
                    </CardContent>
                </Card>
            </DashboardLayout>
        );
    }

    const statusData = [
        { name: "Pending", value: stats.pending, color: STATUS_COLORS.pending },
        { name: "Processing", value: stats.processing, color: STATUS_COLORS.processing },
        { name: "Delivered", value: stats.delivered, color: STATUS_COLORS.delivered },
        { name: "Failed", value: stats.failed, color: STATUS_COLORS.failed },
    ].filter((d) => d.value > 0);

    // Build channel data dynamically from byChannel record
    const channelData = Object.entries(stats.byChannel)
        .map(([channel, count], index) => ({
            name: channel.charAt(0).toUpperCase() + channel.slice(1),
            value: count,
            color: getChannelColor(channel, index),
        }))
        .filter((d) => d.value > 0);

    const deliveryRate = stats.total > 0 ? ((stats.delivered / stats.total) * 100).toFixed(1) : "0";
    const failureRate = stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) : "0";

    const barData = [
        { name: "Pending", count: stats.pending, fill: STATUS_COLORS.pending },
        { name: "Processing", count: stats.processing, fill: STATUS_COLORS.processing },
        { name: "Delivered", count: stats.delivered, fill: STATUS_COLORS.delivered },
        { name: "Failed", count: stats.failed, fill: STATUS_COLORS.failed },
    ];

    return (
        <DashboardLayout title="Analytics" description="Insights and performance metrics">
            <div className="space-y-6">
                {/* Key Metrics */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total Notifications</CardDescription>
                            <CardTitle className="text-3xl">{stats.total.toLocaleString()}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Delivery Rate</CardDescription>
                            <CardTitle className="text-3xl text-green-600">{deliveryRate}%</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Failure Rate</CardDescription>
                            <CardTitle className={`text-3xl ${parseFloat(failureRate) > 5 ? "text-red-600" : "text-muted-foreground"}`}>
                                {failureRate}%
                            </CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>In Progress</CardDescription>
                            <CardTitle className="text-3xl text-blue-600">
                                {(stats.pending + stats.processing).toLocaleString()}
                            </CardTitle>
                        </CardHeader>
                    </Card>
                </div>

                {/* Charts */}
                <Tabs defaultValue="status" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="status">By Status</TabsTrigger>
                        <TabsTrigger value="channel">By Channel</TabsTrigger>
                    </TabsList>

                    <TabsContent value="status" className="space-y-4">
                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Status Pie Chart */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Status Distribution</CardTitle>
                                    <CardDescription>Breakdown of notifications by status</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {statusData.length === 0 ? (
                                        <div className="h-64 flex items-center justify-center text-muted-foreground">
                                            No data available
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={statusData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={100}
                                                    paddingAngle={2}
                                                    dataKey="value"
                                                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                                >
                                                    {statusData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Status Bar Chart */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Status Counts</CardTitle>
                                    <CardDescription>Number of notifications per status</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={barData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip />
                                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                                {barData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="channel" className="space-y-4">
                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Channel Pie Chart */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Channel Distribution</CardTitle>
                                    <CardDescription>Breakdown of notifications by channel</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {channelData.length === 0 ? (
                                        <div className="h-64 flex items-center justify-center text-muted-foreground">
                                            No data available
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={channelData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={100}
                                                    paddingAngle={2}
                                                    dataKey="value"
                                                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                                >
                                                    {channelData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Channel Comparison */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Channel Comparison</CardTitle>
                                    <CardDescription>Notifications by channel</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={channelData} layout="vertical">
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" />
                                            <YAxis dataKey="name" type="category" />
                                            <Tooltip />
                                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                {channelData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
}
