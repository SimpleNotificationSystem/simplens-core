"use client";

import { useState } from "react";
import useSWR from "swr";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ChannelBadge } from "@/components/events/channel-badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, AlertTriangle, Eye } from "lucide-react";
import { format } from "date-fns";
import type { PaginatedResponse, Notification } from "@/lib/types";
import Link from "next/link";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function FailedPage() {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isRetrying, setIsRetrying] = useState(false);
    const [retryDialogOpen, setRetryDialogOpen] = useState(false);

    const { data, isLoading, error, mutate } = useSWR<PaginatedResponse<Notification>>(
        "/api/notifications?status=failed&limit=50",
        fetcher
    );

    const handleSelectAll = (checked: boolean) => {
        if (checked && data) {
            setSelectedIds(data.data.map((n) => n._id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds([...selectedIds, id]);
        } else {
            setSelectedIds(selectedIds.filter((i) => i !== id));
        }
    };

    const handleRetrySelected = async () => {
        if (selectedIds.length === 0) return;

        setIsRetrying(true);
        let successCount = 0;
        let failCount = 0;

        for (const id of selectedIds) {
            try {
                const response = await fetch(`/api/notifications/${id}/retry`, {
                    method: "POST",
                });
                if (response.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch {
                failCount++;
            }
        }

        if (successCount > 0) {
            toast.success(`${successCount} notification(s) queued for retry`);
        }
        if (failCount > 0) {
            toast.error(`Failed to retry ${failCount} notification(s)`);
        }

        setSelectedIds([]);
        setIsRetrying(false);
        setRetryDialogOpen(false);
        mutate();
    };

    const failedCount = data?.total || 0;

    return (
        <DashboardLayout
            title="Failed Events"
            description="Inspect and retry failed notifications"
        >
            <div className="space-y-6">
                {/* Summary Card */}
                <Card className="border-red-200 dark:border-red-900">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            <CardTitle>Failed Notifications</CardTitle>
                        </div>
                        <CardDescription>
                            {failedCount === 0
                                ? "No failed notifications - all clear!"
                                : `${failedCount} notification(s) require attention`}
                        </CardDescription>
                    </CardHeader>
                    {failedCount > 0 && (
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={selectedIds.length === 0 || isRetrying}
                                    onClick={() => setRetryDialogOpen(true)}
                                >
                                    <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
                                    Retry Selected ({selectedIds.length})
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => mutate()}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Refresh
                                </Button>
                            </div>
                        </CardContent>
                    )}
                </Card>

                {/* Table */}
                {isLoading ? (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]"></TableHead>
                                    <TableHead>Request ID</TableHead>
                                    <TableHead>Channel</TableHead>
                                    <TableHead>Recipient</TableHead>
                                    <TableHead>Error</TableHead>
                                    <TableHead>Retries</TableHead>
                                    <TableHead>Failed At</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[...Array(5)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : error || !data ? (
                    <Card>
                        <CardContent className="py-8 text-center text-muted-foreground">
                            Failed to load notifications
                        </CardContent>
                    </Card>
                ) : data.data.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-lg font-medium">No failed notifications</p>
                            <p className="text-sm text-muted-foreground">All notifications are processing correctly</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">
                                        <Checkbox
                                            checked={selectedIds.length === data.data.length}
                                            onCheckedChange={handleSelectAll}
                                        />
                                    </TableHead>
                                    <TableHead>Request ID</TableHead>
                                    <TableHead>Channel</TableHead>
                                    <TableHead>Recipient</TableHead>
                                    <TableHead>Error</TableHead>
                                    <TableHead>Retries</TableHead>
                                    <TableHead>Failed At</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.data.map((notification) => (
                                    <TableRow key={notification._id}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedIds.includes(notification._id)}
                                                onCheckedChange={(checked) =>
                                                    handleSelectOne(notification._id, checked as boolean)
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                            {notification.request_id.substring(0, 8)}...
                                        </TableCell>
                                        <TableCell>
                                            <ChannelBadge channel={notification.channel} />
                                        </TableCell>
                                        <TableCell className="max-w-[150px] truncate">
                                            {String(notification.recipient.email || notification.recipient.phone || notification.recipient.user_id || '')}
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate text-red-600 dark:text-red-400">
                                            {notification.error_message || "Unknown error"}
                                        </TableCell>
                                        <TableCell>{notification.retry_count}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {format(new Date(notification.updated_at), "MMM d, HH:mm")}
                                        </TableCell>
                                        <TableCell>
                                            <Link href={`/events/${notification._id}`}>
                                                <Button variant="ghost" size="icon">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* Retry Confirmation Dialog */}
                <Dialog open={retryDialogOpen} onOpenChange={setRetryDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Retry Failed Notifications</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to retry {selectedIds.length} selected notification(s)?
                                They will be reset to pending status and reprocessed.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setRetryDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleRetrySelected} disabled={isRetrying}>
                                {isRetrying ? (
                                    <>
                                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                        Retrying...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Retry All
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </DashboardLayout>
    );
}
