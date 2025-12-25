"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useSWR from "swr";
import { useState, useMemo, useCallback } from "react";
import { Copy, Check, Code, Zap, AlertCircle } from "lucide-react";

// Types
interface FieldDefinition {
    name: string;
    type: string;
    required: boolean;
    description?: string;
}

interface ProviderMetadata {
    id: string;
    name: string;
    displayName: string;
    description?: string;
    priority: number;
    recipientFields: FieldDefinition[];
    contentFields: FieldDefinition[];
}

interface ChannelMetadata {
    providers: ProviderMetadata[];
    default?: string;
    fallback?: string;
}

interface PluginsResponse {
    channels: Record<string, ChannelMetadata>;
}

interface ChannelSelection {
    channel: string;
    provider: string | null;
    enabled: boolean;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Map field type to schema type display - show (optional) for non-required fields
function getTypeDisplay(field: FieldDefinition): string {
    const suffix = field.required ? "" : " (optional)";
    switch (field.type) {
        case "email": return `string (email)${suffix}`;
        case "phone": return `string (phone)${suffix}`;
        case "text": return `string${suffix}`;
        case "number": return `number${suffix}`;
        case "boolean": return `boolean${suffix}`;
        default: return `string${suffix}`;
    }
}

export default function ApiDesignerPage() {
    const { data, isLoading, error } = useSWR<PluginsResponse>("/api/plugins", fetcher);

    // Form state
    const [mode, setMode] = useState<"single" | "batch">("single");
    const [channelSelections, setChannelSelections] = useState<ChannelSelection[]>([]);

    // Optional field toggles
    const [includeClientName, setIncludeClientName] = useState(false);
    const [includeProvider, setIncludeProvider] = useState(true);
    const [includeVariables, setIncludeVariables] = useState(false);
    const [includeScheduledAt, setIncludeScheduledAt] = useState(false);

    // Copy state
    const [copied, setCopied] = useState(false);

    // Initialize channel selections when data loads
    useMemo(() => {
        if (data?.channels && channelSelections.length === 0) {
            const selections = Object.entries(data.channels).map(([channel, meta]) => ({
                channel,
                provider: meta.default || meta.providers[0]?.id || null,
                enabled: false
            }));
            setChannelSelections(selections);
        }
    }, [data, channelSelections.length]);

    // Get enabled channels
    const enabledChannels = useMemo(() => {
        return channelSelections.filter(s => s.enabled);
    }, [channelSelections]);

    // Toggle channel
    const toggleChannel = useCallback((channel: string) => {
        setChannelSelections(prev => prev.map(s =>
            s.channel === channel ? { ...s, enabled: !s.enabled } : s
        ));
    }, []);

    // Update provider for channel
    const updateProvider = useCallback((channel: string, provider: string) => {
        setChannelSelections(prev => prev.map(s =>
            s.channel === channel ? { ...s, provider } : s
        ));
    }, []);

    // Generate TYPE schema (not example values)
    const schema = useMemo(() => {
        if (enabledChannels.length === 0) {
            return { message: "Select at least one channel to generate schema" };
        }

        // Build recipient schema from provider fields
        const recipientSchema: Record<string, string> = {};
        enabledChannels.forEach(({ channel }) => {
            const provider = data?.channels[channel]?.providers.find(
                p => p.id === channelSelections.find(s => s.channel === channel)?.provider
            );
            if (provider?.recipientFields) {
                provider.recipientFields.forEach(field => {
                    recipientSchema[field.name] = getTypeDisplay(field);
                });
            }
        });
        // Add fallback if empty
        if (Object.keys(recipientSchema).length === 0) {
            recipientSchema.user_id = "string";
        }

        // Build content schema - nested by channel for multi-channel
        const contentSchema: Record<string, unknown> = {};
        enabledChannels.forEach(({ channel }) => {
            const provider = data?.channels[channel]?.providers.find(
                p => p.id === channelSelections.find(s => s.channel === channel)?.provider
            );

            if (provider?.contentFields && provider.contentFields.length > 0) {
                const channelContent: Record<string, string> = {};
                provider.contentFields.forEach(field => {
                    channelContent[field.name] = getTypeDisplay(field);
                });
                contentSchema[channel] = channelContent;
            }
        });
        // Fallback if empty
        if (Object.keys(contentSchema).length === 0) {
            contentSchema.message = "string";
        }

        if (mode === "single") {
            const result: Record<string, unknown> = {
                request_id: "UUID (v4)",
                client_id: "UUID (v4)",
                channel: "string[]",
                recipient: recipientSchema,
                content: contentSchema,
                webhook_url: "string (URL)"
            };

            if (includeClientName) {
                result.client_name = "string (optional)";
            }
            if (includeProvider) {
                result.provider = "string[] (optional)";
            }
            if (includeVariables) {
                result.variables = "Record<string, string> (optional)";
            }
            if (includeScheduledAt) {
                result.scheduled_at = "ISO 8601 date string (optional)";
            }

            return result;
        } else {
            // Batch mode
            const recipientItemSchema: Record<string, string> = {
                request_id: "UUID (v4)",
                user_id: "string",
                ...recipientSchema
            };
            if (includeVariables) {
                recipientItemSchema.variables = "Record<string, string> (optional)";
            }

            const result: Record<string, unknown> = {
                client_id: "UUID (v4)",
                channel: "string[]",
                content: contentSchema,
                recipients: [recipientItemSchema],
                webhook_url: "string (URL)"
            };

            if (includeClientName) {
                result.client_name = "string (optional)";
            }
            if (includeProvider) {
                result.provider = "string | string[] (optional)";
            }
            if (includeScheduledAt) {
                result.scheduled_at = "ISO 8601 date string (optional)";
            }

            return result;
        }
    }, [mode, enabledChannels, includeClientName, includeProvider, includeVariables, includeScheduledAt, data, channelSelections]);

    const schemaJson = JSON.stringify(schema, null, 2);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(schemaJson);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <DashboardLayout
            title="Payload Studio"
            description="Generate notification request schemas for your integrations"
        >
            <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2 items-start">
                    {/* Configuration Panel */}
                    <div className="space-y-6 min-w-0">
                        {/* Mode & Channels */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Zap className="h-5 w-5" />
                                    Request Configuration
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {isLoading && (
                                    <div className="space-y-4">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                    </div>
                                )}

                                {error && (
                                    <div className="flex items-center gap-2 text-destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <span>Failed to load plugins</span>
                                    </div>
                                )}

                                {data && (
                                    <>
                                        {/* Mode Toggle */}
                                        <div className="space-y-2">
                                            <Label>Request Mode</Label>
                                            <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "batch")}>
                                                <TabsList className="grid w-full grid-cols-2">
                                                    <TabsTrigger value="single">Single</TabsTrigger>
                                                    <TabsTrigger value="batch">Batch</TabsTrigger>
                                                </TabsList>
                                            </Tabs>
                                        </div>

                                        {/* Channel Selection */}
                                        <div className="space-y-3">
                                            <Label>Channels (select multiple)</Label>
                                            <div className="space-y-2">
                                                {channelSelections.map(({ channel, provider, enabled }) => (
                                                    <div key={channel} className="flex items-center gap-3 p-3 border rounded-lg">
                                                        <Checkbox
                                                            id={`channel-${channel}`}
                                                            checked={enabled}
                                                            onCheckedChange={() => toggleChannel(channel)}
                                                        />
                                                        <Label htmlFor={`channel-${channel}`} className="flex-1 cursor-pointer font-medium">
                                                            {channel.charAt(0).toUpperCase() + channel.slice(1)}
                                                        </Label>
                                                        {enabled && includeProvider && data.channels[channel]?.providers && (
                                                            <Select
                                                                value={provider || ""}
                                                                onValueChange={(v) => updateProvider(channel, v)}
                                                            >
                                                                <SelectTrigger className="w-[180px]">
                                                                    <SelectValue placeholder="Provider" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {data.channels[channel].providers.map(p => (
                                                                        <SelectItem key={p.id} value={p.id}>
                                                                            {p.displayName || p.name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    </div>
                                                ))}
                                                {channelSelections.length === 0 && (
                                                    <p className="text-sm text-muted-foreground">
                                                        No plugins installed. Install plugins with: <code className="bg-muted px-1 rounded">npm run plugin:install</code>
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        {/* Optional Fields */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Optional Fields</CardTitle>
                                <CardDescription>Toggle to include in schema</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Client Name */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label>client_name</Label>
                                        <p className="text-xs text-muted-foreground">Human-readable client identifier</p>
                                    </div>
                                    <Switch checked={includeClientName} onCheckedChange={setIncludeClientName} />
                                </div>

                                {/* Provider */}
                                <div className="flex items-center justify-between pt-2 border-t">
                                    <div className="space-y-0.5">
                                        <Label>provider</Label>
                                        <p className="text-xs text-muted-foreground">Specify which provider per channel</p>
                                    </div>
                                    <Switch checked={includeProvider} onCheckedChange={setIncludeProvider} />
                                </div>

                                {/* Variables */}
                                <div className="flex items-center justify-between pt-2 border-t">
                                    <div className="space-y-0.5">
                                        <Label>variables</Label>
                                        <p className="text-xs text-muted-foreground">Key-value pairs for templating</p>
                                    </div>
                                    <Switch checked={includeVariables} onCheckedChange={setIncludeVariables} />
                                </div>

                                {/* Scheduled At */}
                                <div className="flex items-center justify-between pt-2 border-t">
                                    <div className="space-y-0.5">
                                        <Label>scheduled_at</Label>
                                        <p className="text-xs text-muted-foreground">Send at a specific time</p>
                                    </div>
                                    <Switch checked={includeScheduledAt} onCheckedChange={setIncludeScheduledAt} />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Info about batch mode */}
                        {mode === "batch" && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Batch Mode Info</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">
                                        In batch mode, each recipient needs their own <code className="bg-muted px-1 rounded">request_id</code> and <code className="bg-muted px-1 rounded">user_id</code>.
                                        The <code className="bg-muted px-1 rounded">content</code> is shared across all recipients.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Schema Output */}
                    <div className="lg:row-span-2 min-w-0">
                        <Card className="sticky top-4 h-full">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2">
                                        <Code className="h-5 w-5" />
                                        Request Schema
                                    </CardTitle>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopy}
                                        disabled={enabledChannels.length === 0}
                                    >
                                        {copied ? (
                                            <>
                                                <Check className="h-4 w-4 mr-1" />
                                                Copied!
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-4 w-4 mr-1" />
                                                Copy
                                            </>
                                        )}
                                    </Button>
                                </div>
                                <CardDescription>
                                    <code className="text-xs bg-muted px-2 py-1 rounded">
                                        POST /api/notification{mode === "batch" ? "/batch" : ""}
                                    </code>
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm max-h-[600px] overflow-y-auto break-all whitespace-pre-wrap">
                                    <code>{schemaJson}</code>
                                </pre>

                                {enabledChannels.length > 0 && (
                                    <div className="mt-4 pt-4 border-t space-y-3">
                                        <div>
                                            <p className="text-sm font-medium mb-2">Selected Channels:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {enabledChannels.map(({ channel, provider }) => (
                                                    <Badge key={channel} variant="secondary">
                                                        {channel}{includeProvider && provider ? ` → ${provider}` : ""}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            <p><strong>(optional)</strong> = field can be omitted</p>
                                            <p><strong>UUID (v4)</strong> = valid UUIDv4 string</p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
