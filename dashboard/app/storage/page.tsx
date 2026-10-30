"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { HardDrive, Plus, Trash2, CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AddStorageDialog } from "@/components/storage/add-storage-dialog";
import type { StorageProviderConfig } from "@/lib/types";
import { apiClient, storageService } from "@/lib/api-client";
import { toast } from "sonner";

const fetcher = <T,>(url: string): Promise<T> => apiClient.get(url) as unknown as Promise<T>;

export default function StoragePage() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null);

    const { data, isLoading, mutate } = useSWR<{ providers: StorageProviderConfig[] }>(
        "/api/storage",
        fetcher
    );

    const handleToggleEnabled = async (id: string, enabled: boolean) => {
        try {
            await storageService.update(id, { enabled });
            toast.success(`Storage provider ${enabled ? "enabled" : "disabled"}`);
            mutate();
        } catch (error) {
            toast.error("Failed to update storage provider status");
            console.error("Failed to toggle storage provider:", error);
        }
    };

    const handleActivate = async (id: string) => {
        try {
            await storageService.activate(id);
            toast.success("Storage provider set as active");
            mutate();
        } catch (error) {
            toast.error("Failed to activate storage provider");
            console.error("Failed to activate storage provider:", error);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await storageService.delete(id);
            toast.success("Storage provider removed");
            mutate();
        } catch (error) {
            toast.error("Failed to delete storage provider");
            console.error("Failed to delete storage provider:", error);
        } finally {
            setDeleteProviderId(null);
        }
    };

    const providers = data?.providers || [];

    return (
        <DashboardLayout
            title="Storage Management"
            description="Manage external storage providers and environment credentials for notification file attachments"
        >
            <div className="space-y-6">
                {/* Header with Add Button at top right */}
                <div className="flex justify-end items-center">
                    {providers.length > 0 && (
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Storage Provider
                        </Button>
                    )}
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-5xl">
                        <Skeleton className="h-44" />
                        <Skeleton className="h-44" />
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && providers.length === 0 && (
                    <Card className="border-dashed max-w-2xl">
                        <CardContent className="py-16 text-center">
                            <HardDrive className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                            <h3 className="text-xl font-semibold mb-2">No Storage Providers Configured</h3>
                            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                                Configure a storage provider (such as S3, MinIO, or Local) to enable file attachments in notifications.
                            </p>
                            <Button onClick={() => setDialogOpen(true)}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Your First Storage Provider
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Provider List */}
                {!isLoading && providers.length > 0 && (
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-5xl">
                        {providers.map((provider) => {
                            const isActive = Boolean(provider.is_active && provider.enabled);
                            return (
                                <Card
                                    key={provider._id}
                                    className={`relative transition-all ${
                                        isActive
                                            ? "border-primary shadow-sm bg-primary/5"
                                            : ""
                                    }`}
                                >
                                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <HardDrive className="h-5 w-5 text-muted-foreground" />
                                                <CardTitle className="text-base font-semibold">
                                                    {provider.name}
                                                </CardTitle>
                                            </div>
                                            <CardDescription className="font-mono text-xs">
                                                Type: {provider.provider_type}
                                            </CardDescription>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {isActive ? (
                                                <Badge variant="default" className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Active
                                                </Badge>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-xs h-7"
                                                    disabled={!provider.enabled}
                                                    onClick={() => handleActivate(provider._id)}
                                                >
                                                    Set Active
                                                </Button>
                                            )}
                                        </div>
                                    </CardHeader>

                                    <CardContent>
                                        <div className="flex items-center justify-between pt-4 border-t text-sm">
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={provider.enabled}
                                                    onCheckedChange={(checked) => handleToggleEnabled(provider._id, checked)}
                                                />
                                                <span className="text-muted-foreground text-xs">
                                                    {provider.enabled ? "Enabled" : "Disabled"}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                                                    <span className="hidden sm:inline">Encrypted</span>
                                                </div>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="h-7 px-2.5 text-xs flex items-center gap-1"
                                                    onClick={() => setDeleteProviderId(provider._id)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add Storage Provider Dialog */}
            <AddStorageDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSuccess={() => mutate()}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteProviderId} onOpenChange={() => setDeleteProviderId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Storage Provider?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove the storage provider configuration. Notifications using file attachments may fail if no active storage provider is available.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90"
                            onClick={() => deleteProviderId && handleDelete(deleteProviderId)}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    );
}
