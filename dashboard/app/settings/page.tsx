"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGlassmorphism } from "@/components/glassmorphism-provider";
import { useTour } from "@/components/tour/tour-provider";
import {
    ChevronDown,
    Clock,
    Cpu,
    Database,
    Layers,
    Loader2,
    RefreshCw,
    RotateCcw,
    Save,
    ShieldAlert,
    Sliders,
    Sparkles,
} from "lucide-react";
import { settingsService } from "@/lib/api-client";
import type { OperationalSettings } from "@/lib/types";
import { toast } from "sonner";
import packageJson from "../../package.json";

export default function SettingsPage() {
    const { enabled, setEnabled } = useGlassmorphism();
    const { restartTour } = useTour();

    const [settings, setSettings] = useState<OperationalSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Fetch operational settings on mount
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await settingsService.get();
                if (res.success && res.settings) {
                    setSettings(res.settings);
                }
            } catch (err) {
                console.error("Failed to load settings", err);
                toast.error("Failed to load system settings from server");
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            const res = await settingsService.update(settings);
            if (res.success && res.settings) {
                setSettings(res.settings);
                toast.success("Settings updated and synchronized across all instances!");
            }
        } catch (err: unknown) {
            const errorObj = err as Error;
            toast.error(errorObj.message || "Failed to update settings");
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        if (!confirm("Are you sure you want to reset all operational settings to system defaults?")) {
            return;
        }

        setIsResetting(true);
        try {
            const res = await settingsService.reset();
            if (res.success && res.settings) {
                setSettings(res.settings);
                toast.success("Operational settings reset to system defaults!");
            }
        } catch (err: unknown) {
            const errorObj = err as Error;
            toast.error(errorObj.message || "Failed to reset settings");
        } finally {
            setIsResetting(false);
        }
    };

    const updateGroupField = (
        group: keyof OperationalSettings,
        field: string,
        value: unknown
    ) => {
        if (!settings) return;
        setSettings({
            ...settings,
            [group]: {
                ...settings[group],
                [field]: value,
            },
        });
    };

    return (
        <DashboardLayout
            title="Settings"
            description="System operational parameters, runtime synchronization, and configuration"
        >
            <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
                {/* 1. Appearance & Tour */}
                <Card className="border-border/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-pink-500" />
                            Appearance & Tour
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Visual styling layers and interactive guided walkthroughs
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Glassmorphism Layer</p>
                                <p className="text-xs text-muted-foreground">
                                    Applies frosted-glass styling to dashboard UI components.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Switch
                                    checked={enabled}
                                    onCheckedChange={setEnabled}
                                    aria-label="Toggle glassmorphism layer"
                                />
                            </div>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Dashboard Tour</p>
                                <p className="text-xs text-muted-foreground">
                                    Replay the guided walkthrough of the dashboard and its features.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={restartTour}
                                className="gap-2 text-xs"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Restart Tour
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. System Info */}
                <Card className="border-border/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Database className="h-4 w-4 text-emerald-500" />
                            System Information
                        </CardTitle>
                        <CardDescription className="text-xs">Current host deployment details</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Dashboard Version</span>
                            <Badge variant="secondary">{packageJson.version}</Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Runtime Mode</span>
                            <Badge variant="outline">
                                {process.env.NODE_ENV === "production" ? "Production" : "Development"}
                            </Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Configuration Store</span>
                            <span className="text-xs font-mono text-foreground font-medium">
                                MongoDB (system_configs) & Redis Pub/Sub
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Advanced Settings (Operational Engine Configurations) */}
                <div className="border border-border/70 rounded-xl overflow-hidden bg-card/60 transition-all shadow-xs">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                        <div className="flex items-center gap-3.5">
                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                <Sliders className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <h3 className="text-base font-bold text-foreground">Advanced Settings</h3>
                                    <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                                        Operational Config
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Fine-tune live engine parameters for workers, retries, delayed pollers, and telemetry with zero downtime.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                                {showAdvanced ? "Hide settings" : "Show settings"}
                            </span>
                            <ChevronDown
                                className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                                    showAdvanced ? "rotate-180 text-primary" : ""
                                }`}
                            />
                        </div>
                    </button>

                    {showAdvanced && (
                        <div className="p-6 pt-3 border-t border-border/60 space-y-6">
                            {/* Action Bar inside Advanced Settings */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
                                <div>
                                    <h4 className="text-sm font-semibold text-foreground">Live Engine Tuning</h4>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Changes synchronize immediately across all running containers without service restarts.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleReset}
                                        disabled={isLoading || isSaving || isResetting}
                                        className="gap-1.5 text-xs h-9"
                                    >
                                        {isResetting ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RotateCcw className="h-3.5 w-3.5" />
                                        )}
                                        Reset Defaults
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleSave}
                                        disabled={isLoading || isSaving || isResetting}
                                        className="gap-1.5 text-xs h-9 font-semibold"
                                    >
                                        {isSaving ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Save className="h-3.5 w-3.5" />
                                        )}
                                        Save Changes
                                    </Button>
                                </div>
                            </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Loading system settings...</p>
                    </div>
                ) : !settings ? (
                    <div className="text-center py-16 border rounded-xl border-dashed">
                        <p className="text-muted-foreground text-sm">Failed to load configuration.</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => window.location.reload()}
                        >
                            Retry
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* 1. Outbox Background Worker */}
                        <Card className="shadow-xs border-border/60">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <Layers className="h-4 w-4 text-blue-500" />
                                    Outbox Worker
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Configures the background outbox polling, batch processing, and event cleanup.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Poll Interval (ms)</Label>
                                        <Input
                                            type="number"
                                            min={500}
                                            max={60000}
                                            value={settings.worker.outbox_poll_interval_ms}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "worker",
                                                    "outbox_poll_interval_ms",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">Safe: 500 - 60,000</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Batch Size</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={2000}
                                            value={settings.worker.outbox_batch_size}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "worker",
                                                    "outbox_batch_size",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">Safe: 1 - 2,000</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Cleanup Interval (ms)</Label>
                                        <Input
                                            type="number"
                                            min={5000}
                                            max={600000}
                                            value={settings.worker.outbox_cleanup_interval_ms}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "worker",
                                                    "outbox_cleanup_interval_ms",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">Safe: 5k - 600k</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Retention (ms)</Label>
                                        <Input
                                            type="number"
                                            min={10000}
                                            max={86400000}
                                            value={settings.worker.outbox_retention_ms}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "worker",
                                                    "outbox_retention_ms",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">Published retention</span>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Claim Lock Timeout (ms)</Label>
                                    <Input
                                        type="number"
                                        min={5000}
                                        max={300000}
                                        value={settings.worker.outbox_claim_timeout_ms}
                                        onChange={(e) =>
                                            updateGroupField(
                                                "worker",
                                                "outbox_claim_timeout_ms",
                                                parseInt(e.target.value) || 0
                                            )
                                        }
                                        className="h-9 font-mono text-xs"
                                    />
                                    <span className="text-[10px] text-muted-foreground">
                                        Threshold before an abandoned lock is reclaimed by peers
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 2. Retry & Idempotency */}
                        <Card className="shadow-xs border-border/60">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <RefreshCw className="h-4 w-4 text-amber-500" />
                                    Retry & Idempotency
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Failure retries, deduplication caching, and execution locks.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Max Retry Count</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={30}
                                        value={settings.retry.max_retry_count}
                                        onChange={(e) =>
                                            updateGroupField(
                                                "retry",
                                                "max_retry_count",
                                                parseInt(e.target.value) || 0
                                            )
                                        }
                                        className="h-9 font-mono text-xs"
                                    />
                                    <span className="text-[10px] text-muted-foreground">
                                        Max attempts before permanently marking as failed
                                    </span>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Idempotency TTL (seconds)</Label>
                                    <Input
                                        type="number"
                                        min={60}
                                        max={2592000}
                                        value={settings.retry.idempotency_ttl_seconds}
                                        onChange={(e) =>
                                            updateGroupField(
                                                "retry",
                                                "idempotency_ttl_seconds",
                                                parseInt(e.target.value) || 0
                                            )
                                        }
                                        className="h-9 font-mono text-xs"
                                    />
                                    <span className="text-[10px] text-muted-foreground">
                                        How long deduplication keys are held in Redis (86400s = 24h)
                                    </span>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Processing Lock TTL (seconds)</Label>
                                    <Input
                                        type="number"
                                        min={10}
                                        max={1800}
                                        value={settings.retry.processing_ttl_seconds}
                                        onChange={(e) =>
                                            updateGroupField(
                                                "retry",
                                                "processing_ttl_seconds",
                                                parseInt(e.target.value) || 0
                                            )
                                        }
                                        className="h-9 font-mono text-xs"
                                    />
                                    <span className="text-[10px] text-muted-foreground">
                                        Active processing mutex duration (default: 120s)
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 3. Delayed Processor */}
                        <Card className="shadow-xs border-border/60">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-purple-500" />
                                    Delayed Processor
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Parameters for scheduled and deferred notification poller.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Poll Interval (ms)</Label>
                                        <Input
                                            type="number"
                                            min={200}
                                            max={30000}
                                            value={settings.delayed.delayed_poll_interval_ms}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "delayed",
                                                    "delayed_poll_interval_ms",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">Safe: 200 - 30,000</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Batch Size</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={500}
                                            value={settings.delayed.delayed_batch_size}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "delayed",
                                                    "delayed_batch_size",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">Safe: 1 - 500</span>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Max Poller Retries</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={settings.delayed.max_poller_retries}
                                        onChange={(e) =>
                                            updateGroupField(
                                                "delayed",
                                                "max_poller_retries",
                                                parseInt(e.target.value) || 0
                                            )
                                        }
                                        className="h-9 font-mono text-xs"
                                    />
                                    <span className="text-[10px] text-muted-foreground">
                                        Attempts before moving an unroutable scheduled event to DLQ
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 4. Recovery & Health Service */}
                        <Card className="shadow-xs border-border/60">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <ShieldAlert className="h-4 w-4 text-emerald-500" />
                                    Recovery & Audits
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Detects orphaned notifications, resolves stuck states, and manages cleanups.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Recovery Interval (ms)</Label>
                                        <Input
                                            type="number"
                                            min={5000}
                                            max={600000}
                                            value={settings.recovery.recovery_poll_interval_ms}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "recovery",
                                                    "recovery_poll_interval_ms",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">Default: 60,000</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Recovery Batch</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={500}
                                            value={settings.recovery.recovery_batch_size}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "recovery",
                                                    "recovery_batch_size",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">Default: 50</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Stuck Processing (ms)</Label>
                                        <Input
                                            type="number"
                                            min={10000}
                                            max={3600000}
                                            value={settings.recovery.processing_stuck_threshold_ms}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "recovery",
                                                    "processing_stuck_threshold_ms",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">Default: 300,000</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Stuck Pending (ms)</Label>
                                        <Input
                                            type="number"
                                            min={10000}
                                            max={3600000}
                                            value={settings.recovery.pending_stuck_threshold_ms}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "recovery",
                                                    "pending_stuck_threshold_ms",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">Default: 300,000</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 5. System, API & Logging */}
                        <Card className="shadow-xs border-border/60 md:col-span-2">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <Cpu className="h-4 w-4 text-indigo-500" />
                                    API & Observability
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    API request boundaries and Winston logger dynamics across all containers.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Max Batch Request Size</Label>
                                        <Input
                                            type="number"
                                            min={10}
                                            max={10000}
                                            value={settings.api.max_batch_req_limit}
                                            onChange={(e) =>
                                                updateGroupField(
                                                    "api",
                                                    "max_batch_req_limit",
                                                    parseInt(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 font-mono text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">
                                            Max items per batch notification API call
                                        </span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Log Severity Filter</Label>
                                        <Select
                                            value={settings.logging.log_level}
                                            onValueChange={(val) =>
                                                updateGroupField("logging", "log_level", val)
                                            }
                                        >
                                            <SelectTrigger className="h-9 text-xs">
                                                <SelectValue placeholder="Select log level" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="debug">debug (Verbose debugging)</SelectItem>
                                                <SelectItem value="info">info (Standard runtime)</SelectItem>
                                                <SelectItem value="warn">warn (Warnings only)</SelectItem>
                                                <SelectItem value="error">error (Errors only)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-[10px] text-muted-foreground">
                                            Immediately switches log level with zero restarts
                                        </span>
                                    </div>

                                    <div className="flex flex-col justify-between p-3 rounded-lg border border-border/60 bg-muted/20">
                                        <div className="space-y-0.5">
                                            <Label className="text-xs font-medium">Log To File</Label>
                                            <p className="text-[11px] text-muted-foreground">
                                                Store rotating JSON log files in /logs directory
                                            </p>
                                        </div>
                                        <div className="pt-2">
                                            <Switch
                                                checked={settings.logging.log_to_file}
                                                onCheckedChange={(val) =>
                                                    updateGroupField("logging", "log_to_file", val)
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
