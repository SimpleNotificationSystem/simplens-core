"use client";

import { use } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatusBadge } from "@/components/events/status-badge";
import { ChannelBadge } from "@/components/events/channel-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, RefreshCw, Trash2, Clock, User, Mail, Phone, Link as LinkIcon } from "lucide-react";
import { format } from "date-fns";
import { Notification, NOTIFICATION_STATUS } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function EventDetailPage({ params }: PageProps) {
    const resolvedParams = use(params);
    const router = useRouter();
    const [isRetrying, setIsRetrying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const { data: notification, isLoading, error, mutate } = useSWR<Notification>(
        `/api/notifications/${resolvedParams.id}`,
        fetcher
    );

    const handleRetry = async () => {
        if (!notification) return;

        setIsRetrying(true);
        try {
            const response = await fetch(`/api/notifications/${notification._id}/retry`, {
                method: "POST",
            });

            if (response.ok) {
                toast.success("Notification queued for retry");
                mutate();
            } else {
                const data = await response.json();
                toast.error(data.error || "Failed to retry notification");
            }
        } catch {
            toast.error("Failed to retry notification");
        } finally {
            setIsRetrying(false);
        }
    };

    const handleDelete = async () => {
        if (!notification) return;

        setIsDeleting(true);
        try {
            const response = await fetch(`/api/notifications/${notification._id}`, {
                method: "DELETE",
            });

            if (response.ok) {
                toast.success("Notification deleted");
                router.push("/events");
            } else {
                const data = await response.json();
                toast.error(data.error || "Failed to delete notification");
            }
        } catch {
            toast.error("Failed to delete notification");
        } finally {
            setIsDeleting(false);
            setDeleteDialogOpen(false);
        }
    };

    if (isLoading) {
        return (
            <DashboardLayout title="Event Details" description="Loading...">
                <div className="space-y-6">
                    <Skeleton className="h-10 w-32" />
                    <div className="grid gap-6 md:grid-cols-2">
                        <Skeleton className="h-64" />
                        <Skeleton className="h-64" />
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    if (error || !notification) {
        return (
            <DashboardLayout title="Event Details" description="Error">
                <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">Notification not found</p>
                    <Link href="/events">
                        <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Events
                        </Button>
                    </Link>
                </div>
            </DashboardLayout>
        );
    }

    const isFailed = notification.status === NOTIFICATION_STATUS.failed;

    return (
        <DashboardLayout
            title="Event Details"
            description={`Request ID: ${notification.request_id}`}
        >
            <div className="space-y-6">
                {/* Header Actions */}
                <div className="flex items-center justify-between">
                    <Link href="/events">
                        <Button variant="outline" size="sm">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2">
                        {isFailed && (
                            <Button
                                onClick={handleRetry}
                                disabled={isRetrying}
                                variant="outline"
                            >
                                <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
                                {isRetrying ? "Retrying..." : "Retry"}
                            </Button>
                        )}
                        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Delete Notification</DialogTitle>
                                    <DialogDescription>
                                        Are you sure you want to delete this notification? This action cannot be undone.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={handleDelete}
                                        disabled={isDeleting}
                                    >
                                        {isDeleting ? "Deleting..." : "Delete"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    {/* Status & Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Notification Info</CardTitle>
                            <CardDescription>Basic details about this notification</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Status</span>
                                <StatusBadge status={notification.status} />
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Channel</span>
                                <ChannelBadge channel={notification.channel} />
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Retry Count</span>
                                <span className="font-mono">{notification.retry_count}</span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Clock className="h-3 w-3" />
                                    Created
                                </span>
                                <span className="text-sm">
                                    {format(new Date(notification.created_at), "PPpp")}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Clock className="h-3 w-3" />
                                    Updated
                                </span>
                                <span className="text-sm">
                                    {format(new Date(notification.updated_at), "PPpp")}
                                </span>
                            </div>
                            {notification.scheduled_at && (
                                <>
                                    <Separator />
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Scheduled For</span>
                                        <span className="text-sm">
                                            {format(new Date(notification.scheduled_at), "PPpp")}
                                        </span>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Recipient */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Recipient</CardTitle>
                            <CardDescription>Recipient details</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">User ID:</span>
                                <span className="font-mono text-sm">{notification.recipient.user_id}</span>
                            </div>
                            {notification.recipient.email && (
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">Email:</span>
                                    <span className="text-sm">{notification.recipient.email}</span>
                                </div>
                            )}
                            {notification.recipient.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">Phone:</span>
                                    <span className="text-sm">{notification.recipient.phone}</span>
                                </div>
                            )}
                            <Separator />
                            <div className="flex items-start gap-2">
                                <LinkIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <span className="text-sm text-muted-foreground block">Webhook URL:</span>
                                    <span className="text-sm font-mono break-all">{notification.webhook_url}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Content */}
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle>Content</CardTitle>
                            <CardDescription>Message content for this notification</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {notification.channel === "email" && notification.content.email && (
                                <div className="space-y-4">
                                    {notification.content.email.subject && (
                                        <div>
                                            <span className="text-sm font-medium">Subject:</span>
                                            <p className="mt-1 text-sm">{notification.content.email.subject}</p>
                                        </div>
                                    )}
                                    <div>
                                        <span className="text-sm font-medium">Message:</span>
                                        <div
                                            className="mt-2 p-4 bg-muted rounded-lg text-sm"
                                            dangerouslySetInnerHTML={{ __html: notification.content.email.message }}
                                        />
                                    </div>
                                </div>
                            )}
                            {notification.channel === "whatsapp" && notification.content.whatsapp && (
                                <div>
                                    <span className="text-sm font-medium">Message:</span>
                                    <p className="mt-2 p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                                        {notification.content.whatsapp.message}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Error Message (if failed) */}
                    {isFailed && notification.error_message && (
                        <Card className="md:col-span-2 border-red-200 dark:border-red-900">
                            <CardHeader>
                                <CardTitle className="text-red-600 dark:text-red-400">Error Details</CardTitle>
                                <CardDescription>This notification failed with the following error</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-800 dark:text-red-300 font-mono">
                                    {notification.error_message}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* IDs */}
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle>Identifiers</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <span className="text-sm text-muted-foreground">Notification ID</span>
                                    <p className="font-mono text-sm mt-1">{notification._id}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-muted-foreground">Request ID</span>
                                    <p className="font-mono text-sm mt-1">{notification.request_id}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-muted-foreground">Client ID</span>
                                    <p className="font-mono text-sm mt-1">{notification.client_id}</p>
                                </div>
                                {notification.client_name && (
                                    <div>
                                        <span className="text-sm text-muted-foreground">Client Name</span>
                                        <p className="text-sm mt-1">{notification.client_name}</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    );
}
