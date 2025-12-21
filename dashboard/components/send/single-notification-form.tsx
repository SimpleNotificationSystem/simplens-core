"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { HtmlPreview } from "./html-preview";
import { toast } from "sonner";
import { Loader2, Send, RefreshCw, AlertCircle } from "lucide-react";
import { DynamicField } from "./dynamic-field";
import { PluginMetadata, ProviderMetadata, FieldDefinition } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Generate a UUIDv4
function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

interface SingleNotificationFormProps {
    onSuccess?: () => void;
}

export function SingleNotificationForm({ onSuccess }: SingleNotificationFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingPlugins, setIsFetchingPlugins] = useState(true);
    const [plugins, setPlugins] = useState<PluginMetadata | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Selection
    const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
    const [selectedProviders, setSelectedProviders] = useState<Record<string, string>>({}); // channel -> providerId

    // Form Data
    const [requestId, setRequestId] = useState(generateUUID());
    const [clientId, setClientId] = useState(generateUUID());
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>();

    // Dynamic Form Data
    const [recipientData, setRecipientData] = useState<Record<string, any>>({});
    const [contentData, setContentData] = useState<Record<string, Record<string, any>>>({}); // channel -> { field: value }

    // Fetch plugins on mount
    useEffect(() => {
        const fetchPlugins = async () => {
            try {
                const res = await fetch('/api/plugins');
                if (!res.ok) {
                    throw new Error(`Failed to load plugins: ${res.statusText}`);
                }
                const data = await res.json();
                setPlugins(data);

                // Select first channel by default if available
                const availableChannels = Object.keys(data.channels || {});
                if (availableChannels.length > 0) {
                    setSelectedChannels([availableChannels[0]]);
                }
            } catch (err) {
                console.error("Error fetching plugins:", err);
                setError("Failed to load plugin configuration. Please check if the backend service is running.");
            } finally {
                setIsFetchingPlugins(false);
            }
        };

        fetchPlugins();
    }, []);

    // Initialize provider selection when channels change
    useEffect(() => {
        if (!plugins) return;

        const newProviders = { ...selectedProviders };
        let hasChanges = false;

        selectedChannels.forEach(channel => {
            if (!newProviders[channel]) {
                // Set default provider
                const channelConfig = plugins.channels[channel];
                if (channelConfig) {
                    newProviders[channel] = channelConfig.default || channelConfig.providers[0]?.id;
                    hasChanges = true;
                }
            }
        });

        if (hasChanges) {
            setSelectedProviders(newProviders);
        }
    }, [selectedChannels, plugins, selectedProviders]);

    const toggleChannel = (channel: string) => {
        setSelectedChannels((prev) =>
            prev.includes(channel)
                ? prev.filter((c) => c !== channel)
                : [...prev, channel]
        );
    };

    const regenerateRequestId = () => {
        setRequestId(generateUUID());
    };

    const updateRecipientData = (field: string, value: any) => {
        setRecipientData(prev => ({ ...prev, [field]: value }));
    };

    const updateContentData = (channel: string, field: string, value: any) => {
        setContentData(prev => ({
            ...prev,
            [channel]: {
                ...(prev[channel] || {}),
                [field]: value
            }
        }));
    };

    const getActiveProvider = (channel: string): ProviderMetadata | undefined => {
        if (!plugins) return undefined;
        const channelConfig = plugins.channels[channel];
        if (!channelConfig) return undefined;

        const providerId = selectedProviders[channel] || channelConfig.default;
        return channelConfig.providers.find(p => p.id === providerId);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (selectedChannels.length === 0) {
            toast.error("Please select at least one channel");
            return;
        }

        // Basic validation
        // In a real app, we would validate against schema here

        setIsLoading(true);

        try {
            // Construct payload dynamically
            const payload: any = {
                type: "single",
                request_id: requestId,
                client_id: clientId,
                channel: selectedChannels,
                recipient: { ...recipientData },
                content: {},
            };

            // Add content for each channel. 
            // The to_channel_notification utility in backend will handle extraction
            // Backend expects: content: { email: { subject, ... }, whatsapp: { message, ... } }
            // or flat content if single channel (legacy support), but we prefer structured

            selectedChannels.forEach(channel => {
                const channelContent = contentData[channel] || {};
                payload.content[channel] = channelContent;
            });

            if (scheduledDate) {
                payload.scheduled_at = scheduledDate.toISOString();
            }

            // Add provider(s) - backend expects string[]
            if (Object.keys(selectedProviders).length > 0) {
                // Map providers to channel order
                const orderedProviders = selectedChannels.map(channel => {
                    return selectedProviders[channel] || undefined;
                }).filter((p): p is string => p !== undefined);

                if (orderedProviders.length > 0) {
                    payload.provider = orderedProviders;
                }
            }

            const response = await fetch("/api/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || "Failed to send");
            }

            toast.success("Notification sent successfully!");
            onSuccess?.();

            // Reset form
            setRequestId(generateUUID());
            setRecipientData({});
            setContentData({});
            setScheduledDate(undefined);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to send notification");
        } finally {
            setIsLoading(false);
        }
    };

    if (isFetchingPlugins) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }

    if (!plugins || Object.keys(plugins.channels).length === 0) {
        return (
            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Plugins Found</AlertTitle>
                <AlertDescription>
                    No notification plugins are configured. Please install and configure plugins in simplens.config.yaml.
                </AlertDescription>
            </Alert>
        );
    }

    const availableChannels = Object.keys(plugins.channels);

    return (
        <form onSubmit={handleSubmit} className="w-full space-y-6">
            {/* Form */}
            <div className="space-y-6">
                {/* Channels */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Channels</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {availableChannels.map(channel => {
                            const isSelected = selectedChannels.includes(channel);
                            const channelConfig = plugins?.channels[channel];
                            const providers = channelConfig?.providers || [];
                            const isMulti = selectedChannels.length > 1;

                            return (
                                <div key={channel} className={`flex flex-col space-y-3 p-3 border rounded-lg transition-all ${isSelected ? 'bg-secondary/10 border-primary/50' : 'opacity-80'}`}>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`channel-${channel}`}
                                            checked={isSelected}
                                            onCheckedChange={() => toggleChannel(channel)}
                                        />
                                        <Label htmlFor={`channel-${channel}`} className="capitalize cursor-pointer flex-1 font-medium">{channel}</Label>
                                    </div>

                                    {isSelected && (
                                        <div className="pl-6">
                                            <div className="flex items-center gap-2">
                                                <Label className="text-xs text-muted-foreground w-16">Provider:</Label>
                                                <Select
                                                    value={selectedProviders[channel]}
                                                    onValueChange={(val) => setSelectedProviders(prev => ({ ...prev, [channel]: val }))}
                                                >
                                                    <SelectTrigger className="h-8 text-xs">
                                                        <SelectValue placeholder="Select provider" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {providers.map(p => (
                                                            <SelectItem key={p.id} value={p.id} className="text-xs">
                                                                {p.displayName} {p.id === channelConfig?.default && "(Default)"}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                {/* Recipient */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Recipient</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Always show Request ID */}
                        <div className="space-y-2">
                            <Label htmlFor="requestId">Request ID</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="requestId"
                                    value={requestId}
                                    onChange={(e) => setRequestId(e.target.value)}
                                    className="font-mono text-xs"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={regenerateRequestId}
                                    title="Generate new UUID"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Dynamic Recipient Fields */}
                        <div className="grid gap-4 md:grid-cols-2">
                            {selectedChannels.flatMap(channel => {
                                const provider = getActiveProvider(channel);
                                if (!provider) return [];

                                return provider.recipientFields.map(field => {
                                    // Use composite key to avoid duplicates if multiple channels share fields (like user_id)
                                    // We'll merge them in state, but need to render them uniquely
                                    // Actually, we should dedup common fields like user_id
                                    return {
                                        ...field,
                                        channel
                                    };
                                });
                            }).reduce((acc: any[], curr) => {
                                // Dedup by field name
                                if (!acc.find(f => f.name === curr.name)) {
                                    acc.push(curr);
                                }
                                return acc;
                            }, []).map((field: any) => (
                                <DynamicField
                                    key={field.name}
                                    field={field}
                                    value={recipientData[field.name]}
                                    onChange={(val) => updateRecipientData(field.name, val)}
                                />
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Content Fields - Per Channel */}
                {selectedChannels.map(channel => {
                    const provider = getActiveProvider(channel);
                    if (!provider) return null;

                    return (
                        <Card key={channel}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium capitalize">{channel} Content</CardTitle>
                                <CardDescription>
                                    Provider: {provider.displayName}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {provider.contentFields.map(field => (
                                    <div key={field.name} className="space-y-2">
                                        <DynamicField
                                            field={field}
                                            value={contentData[channel]?.[field.name]}
                                            onChange={(val) => updateContentData(channel, field.name, val)}
                                        />

                                        {/* Show HTML preview for message/body fields */}
                                        {(field.name === 'message' || field.name === 'body') &&
                                            contentData[channel]?.[field.name] && (
                                                <div className="mt-2">
                                                    <Label className="text-xs text-muted-foreground mb-1 block">Preview</Label>
                                                    <HtmlPreview html={contentData[channel]?.[field.name]} />
                                                </div>
                                            )}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    );
                })}

                {/* Schedule */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Schedule (Optional)</CardTitle>
                        <CardDescription>Leave empty to send immediately</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DateTimePicker
                            value={scheduledDate}
                            onChange={setScheduledDate}
                            placeholder="Pick a date & time"
                        />
                    </CardContent>
                </Card>

                {/* Submit */}
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                        </>
                    ) : (
                        <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Notification
                        </>
                    )}
                </Button>
            </div>
        </form>
    );
}
