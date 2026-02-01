"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, TestTube2, Save, } from "lucide-react";
import type { AlertFilters } from "@/lib/types";

interface AddChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

const DEFAULT_FILTERS: AlertFilters = {
    failed_notifications: true,
    service_health: true,
    stuck_processing: true,
    orphaned_pending: true,
    ghost_delivery: false,
};

const FILTER_LABELS: Record<keyof AlertFilters, { label: string; description: string }> = {
    failed_notifications: {
        label: "Failed Notifications",
        description: "Notifications that exceeded max retry attempts",
    },
    service_health: {
        label: "Service Health",
        description: "MongoDB, Redis, Kafka connection issues",
    },
    stuck_processing: {
        label: "Stuck Processing",
        description: "Notifications stuck in processing state",
    },
    orphaned_pending: {
        label: "Orphaned Pending",
        description: "Pending notifications without outbox records",
    },
    ghost_delivery: {
        label: "Ghost Delivery",
        description: "Processed notifications without corresponding record",
    },
};

// Official Discord icon
export const DiscordIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
);

export function AddChannelDialog({ open, onOpenChange, onSuccess }: AddChannelDialogProps) {
    const [channelType, setChannelType] = useState("discord");
    const [name, setName] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [filters, setFilters] = useState<AlertFilters>(DEFAULT_FILTERS);
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

    const resetForm = () => {
        setName("");
        setWebhookUrl("");
        setFilters(DEFAULT_FILTERS);
        setTestResult(null);
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch("/api/admin-channels/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channel_type: channelType,
                    config: { webhook_url: webhookUrl },
                }),
            });
            const data = await res.json();
            setTestResult({
                success: data.success,
                message: data.success ? "Test message sent! Check your Discord." : data.error,
            });
        } catch {
            setTestResult({ success: false, message: "Test failed - network error" });
        } finally {
            setTesting(false);
        }
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin-channels", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channel_type: channelType,
                    name,
                    config: { webhook_url: webhookUrl },
                    alert_filters: filters,
                }),
            });

            if (res.ok) {
                onSuccess();
                onOpenChange(false);
                resetForm();
            } else {
                const data = await res.json();
                alert(data.error || "Failed to create channel");
            }
        } catch {
            alert("Failed to create channel - network error");
        } finally {
            setLoading(false);
        }
    };

    const isValid = name.trim() && webhookUrl.includes("discord.com/api/webhooks/");

    return (
        <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
            <DialogContent className="sm:w-lg h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Add Notification Channel</DialogTitle>
                    <DialogDescription>
                        Configure a channel to receive admin alerts about system events.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="h-[70%] overflow-hidden pr-4">
                    <div className="space-y-4 py-4">
                    {/* Channel Type */}
                    <div className="space-y-2">
                        <Label>Channel Type</Label>
                        <Select value={channelType} onValueChange={setChannelType}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="discord">
                                    <span className="flex items-center gap-2">
                                        <DiscordIcon className="h-4 w-4" />
                                        Discord
                                    </span>
                                </SelectItem>
                                {/*<SelectItem value="telegram" disabled>
                                    📱 Telegram (Coming Soon)
                                </SelectItem>
                                <SelectItem value="slack" disabled>
                                    💼 Slack (Coming Soon)
                                </SelectItem>*/}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Channel Name */}
                    <div className="space-y-2">
                        <Label>Channel Name</Label>
                        <Input
                            placeholder="e.g., Production Alerts"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    {/* Discord Webhook URL */}
                    <div className="space-y-2">
                        <Label>Discord Webhook URL</Label>
                        <Input
                            placeholder="https://discord.com/api/webhooks/..."
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            type="url"
                        />
                        <p className="text-xs text-muted-foreground">
                            Create a webhook in your Discord server settings → Integrations → Webhooks
                        </p>
                    </div>

                    {/* Test Button & Result */}
                    {webhookUrl && (
                        <div className="space-y-2">
                            <Button
                                variant="outline"
                                onClick={handleTest}
                                disabled={testing || !webhookUrl.includes("discord.com")}
                                className="w-full"
                            >
                                {testing ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <TestTube2 className="h-4 w-4 mr-2" />
                                )}
                                Test Connection
                            </Button>
                            {testResult && (
                                <p className={`text-sm ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                                    {testResult.message}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Alert Filters */}
                    <div className="space-y-3">
                        <Label>Alert Types</Label>
                        <div className="space-y-3 rounded-lg border p-4">
                            {(Object.keys(FILTER_LABELS) as Array<keyof AlertFilters>).map((key) => (
                                <div key={key} className="flex items-start gap-3">
                                    <Checkbox
                                        id={key}
                                        checked={filters[key]}
                                        onCheckedChange={(checked) =>
                                            setFilters({ ...filters, [key]: !!checked })
                                        }
                                    />
                                    <div className="grid gap-1">
                                        <label htmlFor={key} className="text-sm font-medium cursor-pointer">
                                            {FILTER_LABELS[key].label}
                                        </label>
                                        <p className="text-xs text-muted-foreground">
                                            {FILTER_LABELS[key].description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    </div>
                </ScrollArea>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!isValid || loading}>
                        {loading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Channel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
