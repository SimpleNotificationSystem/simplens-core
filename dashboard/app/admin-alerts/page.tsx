"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import useSWR from "swr";
import { BellRing, Plus, Trash2 } from "lucide-react";
import { ComponentType, useState } from "react";
import { AddChannelDialog } from "@/components/admin-alerts/add-channel-dialog";
import type { AdminChannel } from "@/lib/types";
import { CHANNEL_ICONS } from "@/components/admin-alerts/add-channel-dialog";
const fetcher = (url: string) => fetch(url).then((res) => res.json());

const ALERT_TYPE_LABELS: Record<string, string> = {
    failed_notifications: "Failed Notifications",
    service_health: "Service Health",
    stuck_processing: "Stuck Processing",
    orphaned_pending: "Orphaned Pending",
    ghost_delivery: "Ghost Delivery",
};

export default function AdminAlertsPage() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteChannelId, setDeleteChannelId] = useState<string | null>(null);
    const { data, isLoading, mutate } = useSWR<{ channels: AdminChannel[] }>(
        "/api/admin-channels",
        fetcher
    );

    const handleToggle = async (id: string, enabled: boolean) => {
        try {
            await fetch(`/api/admin-channels/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled }),
            });
            mutate();
        } catch (error) {
            console.error("Failed to toggle channel:", error);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/admin-channels/${id}`, { method: "DELETE" });
            mutate();
        } catch (error) {
            console.error("Failed to delete channel:", error);
        } finally {
            setDeleteChannelId(null);
        }
    };

    return (
        <DashboardLayout
            title="Admin Alerts"
            description="Manage alert channels"
        >
            <div className="space-y-6">
                {/* Header with Add Button */}
                <div className="flex justify-end items-center">
                    {(data?.channels?.length && data.channels.length > 0)? (<Button onClick={() => setDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Channel
                    </Button>): ("")}
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <Skeleton className="h-48" />
                        <Skeleton className="h-48" />
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && data?.channels?.length === 0 && (
                    <Card className="border-dashed">
                        <CardContent className="py-16 text-center">
                            <BellRing className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                            <h3 className="text-xl font-semibold mb-2">No Channels Configured</h3>
                            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                                Add a channel to receive system health and event alerts.
                            </p>
                            <Button onClick={() => setDialogOpen(true)}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Your First Channel
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Channel Cards */}
                <div className="grid gap-4 md:grid-cols-3">
                    {data?.channels?.map((channel) => (
                        <Card key={channel._id} className={!channel.enabled ? "opacity-60" : ""}>
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="h-8 w-8">
                                            {(() => {
                                                const Icon = CHANNEL_ICONS[channel.channel_type];
                                                return Icon ? <Icon className="h-8 w-8" /> : null;
                                            })()}
                                        </span>
                                        <div>
                                            <CardTitle className="text-lg">{channel.name}</CardTitle>
                                            <Badge variant="outline" className="mt-1">
                                                {channel.channel_type}
                                            </Badge>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={channel.enabled}
                                        onCheckedChange={(enabled) => handleToggle(channel._id, enabled)}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent>
                                {/* Alert Filters */}
                                <div className="mb-4">
                                    <p className="text-sm font-medium mb-2 text-muted-foreground">
                                        Alert Types:
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(channel.alert_filters).map(([key, enabled]) => (
                                            <Badge
                                                key={key}
                                                variant={enabled ? "default" : "secondary"}
                                                className={!enabled ? "line-through opacity-50" : ""}
                                            >
                                                {ALERT_TYPE_LABELS[key] || key.replace(/_/g, " ")}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2 pt-2">
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setDeleteChannelId(channel._id)}
                                    >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Delete
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            <AddChannelDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSuccess={() => mutate()}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteChannelId} onOpenChange={(open) => !open && setDeleteChannelId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Channel</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this channel? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteChannelId && handleDelete(deleteChannelId)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    );
}
