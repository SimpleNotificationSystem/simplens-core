"use client";

import { useState, useEffect } from "react";
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
import { Loader2, TestTube2, Save, AlertCircle } from "lucide-react";
import type { AlertFilters } from "@/lib/types";
import { withBasePath } from "@/lib/utils";

interface AddChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

interface CredentialField {
    name: string;
    type: 'string' | 'url' | 'secret';
    label: string;
    placeholder?: string;
    description?: string;
    required: boolean;
    pattern?: string;
}

interface ProviderMeta {
    channelType: string;
    displayName: string;
    credentialFields: CredentialField[];
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

// List of official admin channel icons

// Official Discord icon
export const DiscordIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
);

export const TelegramIcon = ({className}: {className?: string })=>(
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
    </svg>
);

// Icon mapping for channel types
export const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    discord: DiscordIcon,
    telegram: TelegramIcon,
};

export function AddChannelDialog({ open, onOpenChange, onSuccess }: AddChannelDialogProps) {
    const [providers, setProviders] = useState<ProviderMeta[]>([]);
    const [loadingProviders, setLoadingProviders] = useState(false);
    const [providerError, setProviderError] = useState<string | null>(null);
    
    const [channelType, setChannelType] = useState("");
    const [name, setName] = useState("");
    const [config, setConfig] = useState<Record<string, string>>({});
    const [filters, setFilters] = useState<AlertFilters>(DEFAULT_FILTERS);
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

    // Fetch providers when dialog opens
    useEffect(() => {
        if (open && providers.length === 0) {
            fetchProviders();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, providers.length]);

    const fetchProviders = async () => {
        setLoadingProviders(true);
        setProviderError(null);
        try {
            const res = await fetch(withBasePath("/api/admin-channels/providers"));
            if (!res.ok) throw new Error("Failed to fetch providers");
            const data = await res.json();
            setProviders(data.providers || []);
            // Set default channel type to first provider
            if (data.providers?.length > 0 && !channelType) {
                setChannelType(data.providers[0].channelType);
            }
        } catch (err) {
            setProviderError(err instanceof Error ? err.message : "Failed to load providers");
        } finally {
            setLoadingProviders(false);
        }
    };

    const currentProvider = providers.find(p => p.channelType === channelType);

    const resetForm = () => {
        setName("");
        setConfig({});
        setFilters(DEFAULT_FILTERS);
        setTestResult(null);
    };

    const handleConfigChange = (fieldName: string, value: string) => {
        setConfig(prev => ({ ...prev, [fieldName]: value }));
    };

    const validateConfig = (): boolean => {
        if (!currentProvider) return false;
        
        for (const field of currentProvider.credentialFields) {
            const value = config[field.name] || "";
            
            if (field.required && !value.trim()) {
                return false;
            }
            
            if (value && field.pattern) {
                const regex = new RegExp(field.pattern);
                if (!regex.test(value)) {
                    return false;
                }
            }
        }
        return true;
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(withBasePath("/api/admin-channels/test"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channel_type: channelType,
                    config,
                }),
            });
            const data = await res.json();
            setTestResult({
                success: data.success,
                message: data.success ? `Test message sent! Check your ${currentProvider?.displayName || 'channel'}.` : data.error,
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
            const res = await fetch(withBasePath("/api/admin-channels"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channel_type: channelType,
                    name,
                    config,
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

    const isValid = name.trim() && validateConfig();
    const hasConfigValues = Object.values(config).some(v => v?.trim());

    return (
        <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
            <DialogContent className="sm:w-lg h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Add Notification Channel</DialogTitle>
                    <DialogDescription>
                        Configure a channel to receive admin alerts about system events.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="h-[80%] overflow-hidden pr-4">
                    <div className="space-y-4 py-4">
                        {/* Loading/Error state for providers */}
                        {loadingProviders && (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                                <span className="ml-2">Loading providers...</span>
                            </div>
                        )}

                        {providerError && (
                            <div className="flex items-center gap-2 text-destructive p-4 border border-destructive/50 rounded-lg">
                                <AlertCircle className="h-5 w-5" />
                                <span>{providerError}</span>
                                <Button variant="outline" size="sm" onClick={fetchProviders}>
                                    Retry
                                </Button>
                            </div>
                        )}

                        {!loadingProviders && !providerError && providers.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                No channel providers available. Start the backend API server.
                            </div>
                        )}

                        {providers.length > 0 && (
                            <>
                                {/* Channel Type */}
                                <div className="space-y-2">
                                    <Label>Channel Type</Label>
                                    <Select value={channelType} onValueChange={setChannelType}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {providers.map((provider) => {
                                                const Icon = CHANNEL_ICONS[provider.channelType];
                                                return (
                                                    <SelectItem key={provider.channelType} value={provider.channelType}>
                                                        <span className="flex items-center gap-2">
                                                            {Icon && <Icon className="h-4 w-4" />}
                                                            {provider.displayName}
                                                        </span>
                                                    </SelectItem>
                                                );
                                            })}
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

                                {/* Dynamic Credential Fields */}
                                {currentProvider?.credentialFields.map((field) => (
                                    <div key={field.name} className="space-y-2">
                                        <Label>{field.label}</Label>
                                        <Input
                                            placeholder={field.placeholder}
                                            value={config[field.name] || ""}
                                            onChange={(e) => handleConfigChange(field.name, e.target.value)}
                                            type={field.type === 'secret' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                                        />
                                        {field.description && (
                                            <p className="text-xs text-muted-foreground">
                                                {field.description}
                                            </p>
                                        )}
                                    </div>
                                ))}

                                {/* Test Button & Result */}
                                {hasConfigValues && (
                                    <div className="space-y-2">
                                        <Button
                                            variant="outline"
                                            onClick={handleTest}
                                            disabled={testing || !validateConfig()}
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
                            </>
                        )}
                    </div>
                </ScrollArea>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!isValid || loading || providers.length === 0}>
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
