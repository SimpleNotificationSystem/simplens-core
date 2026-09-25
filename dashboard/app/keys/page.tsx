"use client";

import { useState } from "react";
import useSWR from "swr";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Key,
    Plus,
    Copy,
    Check,
    Trash2,
    Ban,
    BarChart3,
    MoreVertical,
    Activity,
    CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient, apiKeyService } from "@/lib/api-client";
import type { ApiKey, ApiKeyUsageDetailResponse } from "@/lib/types";

const fetcher = <T,>(url: string): Promise<T> => apiClient.get(url) as unknown as Promise<T>;

export default function ApiKeysPage() {
    const { data, isLoading, mutate } = useSWR<{ keys: ApiKey[] }>("/api/keys", fetcher);
    const keys = data?.keys || [];

    // Create Modal state
    const [createOpen, setCreateOpen] = useState(false);
    const [newKeyName, setNewKeyName] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    // Reveal Key Modal state
    const [revealedKey, setRevealedKey] = useState<{ name: string; raw_key: string } | null>(null);
    const [copied, setCopied] = useState(false);

    // Action dialogs
    const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);
    const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);

    // Usage Details Sheet/Modal state
    const [selectedUsage, setSelectedUsage] = useState<ApiKeyUsageDetailResponse | null>(null);

    const handleCreateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyName.trim()) {
            toast.error("Please enter a key name");
            return;
        }

        setIsCreating(true);
        try {
            const res = await apiKeyService.create({ name: newKeyName.trim() });
            toast.success("API key created successfully");
            setCreateOpen(false);
            setNewKeyName("");
            setRevealedKey({ name: res.key.name, raw_key: res.raw_key });
            mutate();
        } catch (err: unknown) {
            console.error(err);
            toast.error("Failed to create API key");
        } finally {
            setIsCreating(false);
        }
    };

    const handleCopyKey = () => {
        if (!revealedKey) return;
        navigator.clipboard.writeText(revealedKey.raw_key);
        setCopied(true);
        toast.success("API Key copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRevoke = async () => {
        if (!revokeKeyId) return;
        try {
            await apiKeyService.revoke(revokeKeyId);
            toast.success("API key has been revoked");
            mutate();
        } catch (err) {
            console.error(err);
            toast.error("Failed to revoke API key");
        } finally {
            setRevokeKeyId(null);
        }
    };

    const handleDelete = async () => {
        if (!deleteKeyId) return;
        try {
            await apiKeyService.delete(deleteKeyId);
            toast.success("API key deleted permanently");
            mutate();
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete API key");
        } finally {
            setDeleteKeyId(null);
        }
    };

    const handleViewUsage = async (keyId: string) => {
        try {
            const detail = await apiKeyService.getUsage(keyId);
            setSelectedUsage(detail);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load key usage statistics");
        }
    };

    // Calculate metrics
    const totalKeys = keys.length;
    const activeKeys = keys.filter((k) => k.status === "active").length;
    const totalNotifications = keys.reduce(
        (sum, k) => sum + (k.usage?.total_notifications || 0),
        0
    );

    return (
        <DashboardLayout
            title="API Keys"
            description="Manage external service credentials and inspect real-time usage metrics"
        >
            <div className="space-y-6">
                {/* Actions Toolbar */}
                <div className="flex items-center justify-end">
                    <Button onClick={() => setCreateOpen(true)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Create API Key
                    </Button>
                </div>

                {/* Metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total API Keys</CardTitle>
                            <Key className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalKeys}</div>
                            <p className="text-xs text-muted-foreground">
                                {activeKeys} active, {totalKeys - activeKeys} revoked
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total Ingested Notifications</CardTitle>
                            <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalNotifications.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground">
                                Processed across all generated API keys
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* API Keys Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Active Credentials</CardTitle>
                        <CardDescription>
                            API keys allow external systems and automation workers to interact with SimpleNS.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : keys.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <Key className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                                <p className="font-medium">No API keys found</p>
                                <p className="text-sm mt-1">Create an API key to allow external services to send notifications.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Key Prefix</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Usage (Notifications)</TableHead>
                                            <TableHead>Channel Breakdown</TableHead>
                                            <TableHead>Last Used</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {keys.map((key) => {
                                            const channels = key.usage?.by_channel || {};
                                            const channelEntries = Object.entries(channels);

                                            return (
                                                <TableRow key={key.key_id}>
                                                    <TableCell className="font-medium">
                                                        {key.name}
                                                    </TableCell>
                                                    <TableCell>
                                                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                                                            {key.key_prefix}
                                                        </code>
                                                    </TableCell>
                                                    <TableCell>
                                                        {key.status === "active" ? (
                                                            <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                                                                Active
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="destructive">
                                                                Revoked
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="font-semibold text-sm">
                                                            {(key.usage?.total_notifications || 0).toLocaleString()}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground ml-1">
                                                            ({key.usage?.total_requests || 0} reqs)
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                            {channelEntries.length > 0 ? (
                                                                channelEntries.map(([ch, count]) => (
                                                                    <Badge key={ch} variant="secondary" className="text-[10px] px-1.5 py-0.5">
                                                                        {ch}: {count}
                                                                    </Badge>
                                                                ))
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground">None</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {key.usage?.last_used_at
                                                            ? new Date(key.usage.last_used_at).toLocaleString()
                                                            : "Never"}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                    <MoreVertical className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => handleViewUsage(key.key_id)}>
                                                                    <BarChart3 className="mr-2 h-4 w-4" />
                                                                    View Details & Stats
                                                                </DropdownMenuItem>
                                                                {key.status === "active" && (
                                                                    <DropdownMenuItem
                                                                        className="text-amber-600 dark:text-amber-400"
                                                                        onClick={() => setRevokeKeyId(key.key_id)}
                                                                    >
                                                                        <Ban className="mr-2 h-4 w-4" />
                                                                        Revoke Key
                                                                    </DropdownMenuItem>
                                                                )}
                                                                <DropdownMenuItem
                                                                    className="text-red-600 dark:text-red-400"
                                                                    onClick={() => setDeleteKeyId(key.key_id)}
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Delete Key
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Create Key Modal */}
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogContent className="sm:max-w-md">
                        <form onSubmit={handleCreateKey} className="space-y-4">
                            <DialogHeader>
                                <DialogTitle>Create External API Key</DialogTitle>
                                <DialogDescription>
                                    Enter a descriptive name for this API key. The key secret will be displayed once after creation.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 py-2">
                                <label className="text-sm font-medium">Key Name</label>
                                <Input
                                    placeholder="e.g. Billing Service, Mobile App Backend"
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setCreateOpen(false)}
                                    disabled={isCreating}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isCreating || !newKeyName.trim()}>
                                    {isCreating ? "Generating..." : "Generate Key"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Key Reveal Dialog */}
                <Dialog
                    open={Boolean(revealedKey)}
                    onOpenChange={(open) => {
                        if (!open) setRevealedKey(null);
                    }}
                >
                    <DialogContent className="sm:max-w-md w-full">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-5 w-5 shrink-0" />
                                API Key Created: {revealedKey?.name}
                            </DialogTitle>
                            <DialogDescription>
                                Please copy your API key secret immediately. For security reasons, you will not be able to view it again.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-2">
                            <div className="flex items-center gap-2">
                                <Input
                                    readOnly
                                    value={revealedKey?.raw_key || ""}
                                    className="font-mono text-xs bg-muted min-w-0 flex-1 select-all"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={handleCopyKey}
                                    title="Copy API Key"
                                    className="shrink-0"
                                >
                                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                </Button>
                            </div>

                            <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                                Keep this key confidential. External applications should pass this key in the <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">Authorization: Bearer &lt;key&gt;</code> header.
                            </div>
                        </div>

                        <DialogFooter>
                            <Button onClick={() => setRevealedKey(null)} className="w-full sm:w-auto">
                                I have saved this key
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Usage Detail Dialog */}
                <Dialog open={Boolean(selectedUsage)} onOpenChange={(open) => !open && setSelectedUsage(null)}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <BarChart3 className="h-5 w-5" />
                                API Key Usage: {selectedUsage?.key.name}
                            </DialogTitle>
                            <DialogDescription>
                                Real-time delivery outcomes and volume tracking for this key.
                            </DialogDescription>
                        </DialogHeader>

                        {selectedUsage && (
                            <div className="space-y-4 py-2">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-lg border p-3">
                                        <div className="text-xs text-muted-foreground">Total Ingested</div>
                                        <div className="text-xl font-bold mt-1">
                                            {selectedUsage.key.usage?.total_notifications.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border p-3">
                                        <div className="text-xs text-muted-foreground">Total API Requests</div>
                                        <div className="text-xl font-bold mt-1">
                                            {selectedUsage.key.usage?.total_requests.toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                                        Delivery Status Breakdown
                                    </h4>
                                    <div className="grid grid-cols-4 gap-2 text-center">
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2">
                                            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                                {selectedUsage.status_breakdown.delivered}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground">Delivered</div>
                                        </div>
                                        <div className="bg-red-500/10 border border-red-500/20 rounded p-2">
                                            <div className="text-lg font-bold text-red-600 dark:text-red-400">
                                                {selectedUsage.status_breakdown.failed}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground">Failed</div>
                                        </div>
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2">
                                            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                                                {selectedUsage.status_breakdown.processing}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground">Processing</div>
                                        </div>
                                        <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2">
                                            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                                {selectedUsage.status_breakdown.pending}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground">Pending</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                                        Notifications by Channel
                                    </h4>
                                    <div className="space-y-1.5">
                                        {Object.entries(selectedUsage.key.usage?.by_channel || {}).length > 0 ? (
                                            Object.entries(selectedUsage.key.usage.by_channel).map(([channel, count]) => (
                                                <div key={channel} className="flex justify-between items-center text-xs p-2 rounded bg-muted">
                                                    <span className="font-medium capitalize">{channel}</span>
                                                    <span className="font-bold">{count.toLocaleString()}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-muted-foreground py-2">No channel activity recorded yet.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setSelectedUsage(null)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Revoke Confirmation Dialog */}
                <AlertDialog open={Boolean(revokeKeyId)} onOpenChange={(open) => !open && setRevokeKeyId(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Once revoked, any external service or tool attempting to authenticate with this API key will be immediately blocked with 401 Unauthorized.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleRevoke} className="bg-amber-600 hover:bg-amber-700">
                                Revoke Key
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Delete Confirmation Dialog */}
                <AlertDialog open={Boolean(deleteKeyId)} onOpenChange={(open) => !open && setDeleteKeyId(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete API Key Permanently?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently remove the API key record. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                                Delete Permanently
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </DashboardLayout>
    );
}
