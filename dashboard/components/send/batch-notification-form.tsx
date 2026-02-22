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
import { PluginMetadata, FieldDefinition, NotificationTemplateDetail, NotificationTemplateListItem } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { withBasePath } from "@/lib/utils";

// Generate a UUIDv4
function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

interface BatchRecipient {
    id: string; // Internal UI ID
    request_id: string;
    user_id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const [inputMode, setInputMode] = useState<"content" | "template">("content");

    // Dynamic Data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [contentData, setContentData] = useState<Record<string, Record<string, any>>>({});
    const [recipients, setRecipients] = useState<BatchRecipient[]>([createNewRecipient()]);
    const [templatesByChannel, setTemplatesByChannel] = useState<Record<string, NotificationTemplateListItem[]>>({});
    const [templatesLoadingByChannel, setTemplatesLoadingByChannel] = useState<Record<string, boolean>>({});
    const [selectedTemplatesByChannel, setSelectedTemplatesByChannel] = useState<Record<string, string>>({});
    const [templateDetailsByChannel, setTemplateDetailsByChannel] = useState<Record<string, NotificationTemplateDetail | null>>({});
    const [templateVariableNamesByChannel, setTemplateVariableNamesByChannel] = useState<Record<string, string[]>>({});

    // Preview
    const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

    const extractTemplateVariables = (input: unknown): string[] => {
        const variables = new Set<string>();
        const regex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

        const visit = (value: unknown) => {
            if (typeof value === "string") {
                for (const match of value.matchAll(regex)) {
                    if (match[1]) {
                        variables.add(match[1]);
                    }
                }
                return;
            }

            if (Array.isArray(value)) {
                value.forEach(visit);
                return;
            }

            if (value && typeof value === "object") {
                Object.values(value).forEach(visit);
            }
        };

        visit(input);
        return Array.from(variables).sort((left, right) => left.localeCompare(right));
    };

    const getTemplatePreviewHtml = (content: Record<string, unknown> | undefined): string => {
        if (!content) return "";

        const preferredFields = ["body", "message", "html", "text"];
        for (const field of preferredFields) {
            const value = content[field];
            if (typeof value === "string") {
                return value;
            }
        }

        const firstString = Object.values(content).find((value) => typeof value === "string");
        if (typeof firstString === "string") {
            return firstString;
        }

        return JSON.stringify(content, null, 2);
    };

    const parseRecipientVariables = (raw: string): Record<string, string> => {
        try {
            const parsed = JSON.parse(raw || "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                const result: Record<string, string> = {};
                Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        result[key] = String(value);
                    }
                });
                return result;
            }
            return {};
        } catch {
            return {};
        }
    };

    const updateRecipientTemplateVariable = (recipientId: string, variableName: string, value: string) => {
        setRecipients((prev) =>
            prev.map((recipient) => {
                if (recipient.id !== recipientId) {
                    return recipient;
                }

                const currentVariables = parseRecipientVariables(recipient.variables || "{}");
                const nextVariables = {
                    ...currentVariables,
                    [variableName]: value,
                };

                return {
                    ...recipient,
                    variables: JSON.stringify(nextVariables),
                };
            })
        );
    };

    // Fetch plugins
    useEffect(() => {
        const fetchPlugins = async () => {
            try {
                const res = await fetch(withBasePath('/api/plugins'));
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    useEffect(() => {
        if (!plugins || selectedChannels.length === 0) {
            return;
        }

        let cancelled = false;

        const fetchTemplates = async () => {
            await Promise.all(
                selectedChannels.map(async (channel) => {
                    const provider = getActiveProvider(channel);
                    const packageName = provider?.name;

                    if (!packageName) {
                        if (!cancelled) {
                            setTemplatesByChannel((prev) => ({ ...prev, [channel]: [] }));
                            setTemplatesLoadingByChannel((prev) => ({ ...prev, [channel]: false }));
                        }
                        return;
                    }

                    setTemplatesLoadingByChannel((prev) => ({ ...prev, [channel]: true }));
                    try {
                        const response = await fetch(
                            withBasePath(`/api/templates?package_name=${encodeURIComponent(packageName)}`)
                        );

                        if (!response.ok) {
                            throw new Error(`Failed to fetch templates for ${channel}`);
                        }

                        const data = await response.json();
                        if (!cancelled) {
                            const templates = Array.isArray(data) ? data : [];
                            setTemplatesByChannel((prev) => ({ ...prev, [channel]: templates }));
                            setSelectedTemplatesByChannel((prev) => {
                                const selected = prev[channel];
                                if (selected && templates.some((template) => template.template_id === selected)) {
                                    return prev;
                                }
                                return { ...prev, [channel]: "" };
                            });
                        }
                    } catch {
                        if (!cancelled) {
                            setTemplatesByChannel((prev) => ({ ...prev, [channel]: [] }));
                        }
                    } finally {
                        if (!cancelled) {
                            setTemplatesLoadingByChannel((prev) => ({ ...prev, [channel]: false }));
                        }
                    }
                })
            );
        };

        fetchTemplates();

        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plugins, selectedChannels, selectedProviders]);

    useEffect(() => {
        if (inputMode !== "template") {
            return;
        }

        let cancelled = false;

        const fetchTemplateDetails = async () => {
            await Promise.all(
                selectedChannels.map(async (channel) => {
                    const templateId = selectedTemplatesByChannel[channel];
                    if (!templateId) {
                        if (!cancelled) {
                            setTemplateDetailsByChannel((prev) => ({ ...prev, [channel]: null }));
                            setTemplateVariableNamesByChannel((prev) => ({ ...prev, [channel]: [] }));
                        }
                        return;
                    }

                    try {
                        const response = await fetch(withBasePath(`/api/templates/${encodeURIComponent(templateId)}`));
                        const data = await response.json().catch(() => ({}));

                        if (!response.ok) {
                            throw new Error(data.message || data.error || "Failed to load template detail");
                        }

                        const template = data as NotificationTemplateDetail;
                        const variableNames = extractTemplateVariables(template.content);

                        if (!cancelled) {
                            setTemplateDetailsByChannel((prev) => ({ ...prev, [channel]: template }));
                            setTemplateVariableNamesByChannel((prev) => ({ ...prev, [channel]: variableNames }));
                        }
                    } catch {
                        if (!cancelled) {
                            setTemplateDetailsByChannel((prev) => ({ ...prev, [channel]: null }));
                            setTemplateVariableNamesByChannel((prev) => ({ ...prev, [channel]: [] }));
                        }
                    }
                })
            );
        };

        fetchTemplateDetails();

        return () => {
            cancelled = true;
        };
    }, [inputMode, selectedChannels, selectedTemplatesByChannel]);

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
                } catch {
                    // Ignore invalid JSON, treat as empty
                }

                // Construct recipient object with ONLY relevant fields for selected channels
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const recipientObj: Record<string, any> = {
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: Record<string, any> = {
                type: "batch",
                client_id: clientId,
                channel: selectedChannels,
                recipients: processedRecipients,
            };

            if (inputMode === "template") {
                const missingTemplate = selectedChannels.find((channel) => !selectedTemplatesByChannel[channel]);
                if (missingTemplate) {
                    toast.error(`Select a template for ${missingTemplate}`);
                    setIsLoading(false);
                    return;
                }

                payload.template_id = selectedChannels.map((channel) => selectedTemplatesByChannel[channel]);
            } else {
                payload.content = {};
                selectedChannels.forEach(channel => {
                    payload.content[channel] = contentData[channel] || {};
                });
            }

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

            const response = await fetch(withBasePath("/api/send"), {
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
            setSelectedTemplatesByChannel({});

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
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                            <Label className="text-xs text-muted-foreground sm:w-16 shrink-0">Provider:</Label>
                                            <Select
                                                value={selectedProviders[channel]}
                                                onValueChange={(val) => setSelectedProviders(prev => ({ ...prev, [channel]: val }))}
                                            >
                                                <SelectTrigger className="h-8 text-xs w-full sm:flex-1 max-w-[200px]">
                                                    <SelectValue placeholder="Select provider" className="truncate" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {providers.map(p => (
                                                        <SelectItem key={p.id} value={p.id} className="text-xs">
                                                            <span className="truncate">{p.displayName} ({p.id}) {p.id === channelConfig?.default && "• Default"}</span>
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

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Content Input Mode</CardTitle>
                    <CardDescription>Choose manual content or provider template.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={inputMode} onValueChange={(value) => setInputMode(value as "content" | "template")}>
                        <SelectTrigger className="max-w-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="content">Write content manually</SelectItem>
                            <SelectItem value="template">Choose template</SelectItem>
                        </SelectContent>
                    </Select>
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
                            {inputMode === "template" ? (
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Template Variables</Label>
                                    {Array.from(
                                        new Set(
                                            selectedChannels.flatMap((channel) => templateVariableNamesByChannel[channel] || [])
                                        )
                                    ).length === 0 ? (
                                        <p className="text-xs text-muted-foreground">No variables detected in selected templates.</p>
                                    ) : (
                                        <div className="grid gap-2 md:grid-cols-2">
                                            {Array.from(
                                                new Set(
                                                    selectedChannels.flatMap((channel) => templateVariableNamesByChannel[channel] || [])
                                                )
                                            )
                                                .sort((left, right) => left.localeCompare(right))
                                                .map((variableName) => {
                                                    const variables = parseRecipientVariables(recipient.variables || "{}");
                                                    return (
                                                        <div key={`${recipient.id}-${variableName}`} className="space-y-1">
                                                            <Label className="text-xs">{`{{${variableName}}}`}</Label>
                                                            <Input
                                                                value={variables[variableName] || ""}
                                                                onChange={(event) =>
                                                                    updateRecipientTemplateVariable(recipient.id, variableName, event.target.value)
                                                                }
                                                                placeholder={`Value for ${variableName}`}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <Input
                                    placeholder='Variables (optional): {"name": "Alice"}'
                                    value={recipient.variables}
                                    onChange={(e) => updateRecipient(recipient.id, "variables", e.target.value)}
                                    className="font-mono text-xs"
                                />
                            )}
                        </div>
                    ))}
                </CardContent>
            </Card>

            {inputMode === "template" ? (
                <>
                    {selectedChannels.map((channel) => {
                        const provider = getActiveProvider(channel);
                        const templates = templatesByChannel[channel] ?? [];
                        const isLoadingTemplates = templatesLoadingByChannel[channel];
                        const previewHtml = getTemplatePreviewHtml(templateDetailsByChannel[channel]?.content);

                        return (
                            <Card key={channel}>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-medium capitalize">{channel} Template</CardTitle>
                                    <CardDescription>
                                        Provider: {provider?.displayName ?? "-"} ({provider?.name ?? "package unavailable"})
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <Label>Template</Label>
                                    <Select
                                        value={selectedTemplatesByChannel[channel] || ""}
                                        onValueChange={(value) =>
                                            setSelectedTemplatesByChannel((prev) => ({ ...prev, [channel]: value }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={isLoadingTemplates ? "Loading templates..." : "Select template"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {templates.map((template) => (
                                                <SelectItem key={template.template_id} value={template.template_id}>
                                                    {template.name} ({template.template_id})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {selectedTemplatesByChannel[channel] && previewHtml && (
                                        <div className="space-y-1 pt-2">
                                            <Label className="text-xs text-muted-foreground">
                                                Preview (Recipient 1)
                                            </Label>
                                            <HtmlPreview
                                                html={previewHtml}
                                                variables={parseRecipientVariables(recipients[0]?.variables || "{}")}
                                            />
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </>
            ) : (
                selectedChannels.map(channel => {
                    const provider = getActiveProvider(channel);
                    if (!provider) return null;
                    return (
                        <Card key={channel}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium capitalize">{channel} Content</CardTitle>
                                <CardDescription>Provider: {provider.displayName} ({selectedProviders[channel]}) — Use {"{{variable}}"} for personalization</CardDescription>
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
                })
            )}

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
