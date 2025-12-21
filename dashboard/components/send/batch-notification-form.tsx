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
import { Loader2, Send, Plus, Trash2, AlertCircle } from "lucide-react";
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

interface BatchRecipient {
    id: string; // Internal UI ID
    request_id: string;
    user_id: string;
    [key: string]: any; // Dynamic fields + variables
}

function createNewRecipient(): BatchRecipient {
    return {
        id: generateUUID(),
        request_id: generateUUID(),
        user_id: "",
        variables: "{}"
    };
}

interface BatchNotificationFormProps {
    onSuccess?: () => void;
}

export function BatchNotificationForm({ onSuccess }: BatchNotificationFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingPlugins, setIsFetchingPlugins] = useState(true);
    const [plugins, setPlugins] = useState<PluginMetadata | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Form Data
    const [clientId] = useState(generateUUID());
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>();

    // Selection
    const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
    const [selectedProviders, setSelectedProviders] = useState<Record<string, string>>({});

    // Dynamic Data
    const [contentData, setContentData] = useState<Record<string, Record<string, any>>>({});
    const [recipients, setRecipients] = useState<BatchRecipient[]>([createNewRecipient()]);

    // Preview
    const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

    // Fetch plugins
    useEffect(() => {
        const fetchPlugins = async () => {
            try {
                const res = await fetch('/api/plugins');
                if (!res.ok) throw new Error(`Failed to load plugins: ${res.statusText}`);
                const data = await res.json();
                setPlugins(data);

                // Select first channel by default
                const availableChannels = Object.keys(data.channels || {});
                if (availableChannels.length > 0) {
                    setSelectedChannels([availableChannels[0]]);
                }
            } catch (err) {
                console.error("Error fetching plugins:", err);
                setError("Failed to load plugin configuration.");
            } finally {
                setIsFetchingPlugins(false);
            }
        };
        fetchPlugins();
    }, []);

    // Provider selection logic
    useEffect(() => {
        if (!plugins) return;
        const newProviders = { ...selectedProviders };
        let hasChanges = false;
        selectedChannels.forEach(channel => {
            if (!newProviders[channel]) {
                const channelConfig = plugins.channels[channel];
                if (channelConfig) {
                    newProviders[channel] = channelConfig.default || channelConfig.providers[0]?.id;
                    hasChanges = true;
                }
            }
        });
        if (hasChanges) setSelectedProviders(newProviders);
    }, [selectedChannels, plugins, selectedProviders]);

    // Recipient Management
    const addRecipient = () => setRecipients([...recipients, createNewRecipient()]);

    const removeRecipient = (id: string) => {
        if (recipients.length > 1) {
            setRecipients(recipients.filter(r => r.id !== id));
        }
    };

    const updateRecipient = (id: string, field: string, value: any) => {
        setRecipients(recipients.map(r => r.id === id ? { ...r, [field]: value } : r));

        // Update preview if variables changed on first recipient
        if (field === "variables" && recipients[0].id === id) {
            try {
                setPreviewVariables(JSON.parse(value));
            } catch {
                // Invalid JSON
            }
        }
    };

    const updateContentData = (channel: string, field: string, value: any) => {
        setContentData(prev => ({
            ...prev,
            [channel]: { ...(prev[channel] || {}), [field]: value }
        }));
    };

    const toggleChannel = (channel: string) => {
        setSelectedChannels(prev =>
            prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]
        );
    };

    const getActiveProvider = (channel: string) => {
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

        setIsLoading(true);

        try {
            // Validate JSON variables for all recipients
            const processedRecipients = recipients.map(r => {
                let parsedVariables = {};
                try {
                    parsedVariables = JSON.parse(r.variables || "{}");
                } catch (e) {
                    // Ignore invalid JSON, treat as empty
                }

                // Construct recipient object with ONLY relevant fields for selected channels
                const recipientObj: any = {
                    request_id: r.request_id,
                    user_id: r.user_id,
                    variables: parsedVariables
                };

                // Add fields required by selected channels
                selectedChannels.forEach(channel => {
                    const provider = getActiveProvider(channel);
                    if (provider) {
                        provider.recipientFields.forEach(field => {
                            if (field.name !== 'user_id' && r[field.name]) {
                                recipientObj[field.name] = r[field.name];
                            }
                        });
                    }
                });

                return recipientObj;
            });

            const payload: any = {
                type: "batch",
                client_id: clientId,
                channel: selectedChannels,
                recipients: processedRecipients,
                content: {},
            };

            selectedChannels.forEach(channel => {
                payload.content[channel] = contentData[channel] || {};
            });

            if (scheduledDate) {
                payload.scheduled_at = scheduledDate.toISOString();
            }

            // Add provider(s) - backend expects string[]
            if (Object.keys(selectedProviders).length > 0) {
                // Map providers to channel order, filter out undefined
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

            toast.success(`Batch notification sent to ${recipients.length} recipients!`);
            onSuccess?.();

            // Reset
            setRecipients([createNewRecipient()]);
            setContentData({});
            setScheduledDate(undefined);

        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to send batch notification");
        } finally {
            setIsLoading(false);
        }
    };

    if (isFetchingPlugins) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    if (error) return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
    if (!plugins || Object.keys(plugins.channels).length === 0) return <Alert><AlertTitle>No Plugins</AlertTitle><AlertDescription>No plugins configured.</AlertDescription></Alert>;

    const availableChannels = Object.keys(plugins.channels);

    // Collect all unique recipient fields across selected channels
    const uniqueRecipientFields: (FieldDefinition & { channel: string })[] = [];
    const seenFields = new Set<string>();

    selectedChannels.forEach(channel => {
        const provider = getActiveProvider(channel);
        if (provider) {
            provider.recipientFields.forEach(field => {
                if (field.name === 'user_id') return; // User ID is handled separately
                if (!seenFields.has(field.name)) {
                    seenFields.add(field.name);
                    uniqueRecipientFields.push({ ...field, channel });
                }
            });
        }
    });

    return (
        <form onSubmit={handleSubmit} className="space-y-6 w-full">
            {/* Channels */}
            <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Channels</CardTitle></CardHeader>
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
                                        id={`batch-${channel}`}
                                        checked={isSelected}
                                        onCheckedChange={() => toggleChannel(channel)}
                                    />
                                    <Label htmlFor={`batch-${channel}`} className="capitalize cursor-pointer flex-1 font-medium">{channel}</Label>
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

            {/* Recipients */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-medium">Recipients</CardTitle>
                            <CardDescription>Add multiple recipients with template variables</CardDescription>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addRecipient}>
                            <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {recipients.map((recipient, index) => (
                        <div key={recipient.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Recipient {index + 1}</span>
                                {recipients.length > 1 && (
                                    <Button type="button" variant="ghost" size="sm" onClick={() => removeRecipient(recipient.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                )}
                            </div>

                            {/* Standard User ID */}
                            <Input
                                placeholder="User ID * (string)"
                                value={recipient.user_id}
                                onChange={(e) => updateRecipient(recipient.id, "user_id", e.target.value)}
                                className="font-mono text-xs"
                                required
                            />

                            {/* Dynamic Fields */}
                            <div className="grid gap-3 md:grid-cols-2">
                                {uniqueRecipientFields.map(field => (
                                    <Input
                                        key={field.name}
                                        type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                                        placeholder={`${field.name}${field.required ? ' *' : ''} (${field.description || field.type})`}
                                        value={recipient[field.name] || ''}
                                        onChange={(e) => updateRecipient(recipient.id, field.name, e.target.value)}
                                        required={field.required}
                                    />
                                ))}
                            </div>

                            {/* Variables */}
                            <Input
                                placeholder='Variables (optional): {"name": "Alice"}'
                                value={recipient.variables}
                                onChange={(e) => updateRecipient(recipient.id, "variables", e.target.value)}
                                className="font-mono text-xs"
                            />
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Content Templates */}
            {selectedChannels.map(channel => {
                const provider = getActiveProvider(channel);
                if (!provider) return null;
                return (
                    <Card key={channel}>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium capitalize">{channel} Template</CardTitle>
                            <CardDescription>Provider: {provider.displayName} — Use {"{{variable}}"} for personalization</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {provider.contentFields.map(field => (
                                <div key={field.name} className="space-y-2">
                                    <DynamicField
                                        field={field}
                                        value={contentData[channel]?.[field.name]}
                                        onChange={(val) => updateContentData(channel, field.name, val)}
                                    />
                                    {(field.name === 'message' || field.name === 'body') && contentData[channel]?.[field.name] && (
                                        <div className="mt-2">
                                            <Label className="text-xs text-muted-foreground mb-1 block">Preview (with variables from first recipient)</Label>
                                            <HtmlPreview html={contentData[channel]?.[field.name]} variables={previewVariables} />
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
                    <DateTimePicker value={scheduledDate} onChange={setScheduledDate} placeholder="Pick a date & time" />
                </CardContent>
            </Card>

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : <><Send className="mr-2 h-4 w-4" /> Send Batch ({recipients.length})</>}
            </Button>
        </form>
    );
}
