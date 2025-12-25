"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageToolbar, PageToolbarSection, PageToolbarSpacer } from "@/components/ui/page-toolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import useSWR from "swr";
import { Puzzle, RefreshCw, ChevronDown, Mail, MessageCircle, TestTube2, Zap, User, FileText } from "lucide-react";
import { useMemo, useState } from "react";

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

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Channel-specific colors and icons
const channelConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
    email: {
        icon: Mail,
        color: "text-blue-500",
    },
    whatsapp: {
        icon: MessageCircle,
        color: "text-green-500",
    },
    mock: {
        icon: TestTube2,
        color: "text-purple-500",
    },
    sms: {
        icon: MessageCircle,
        color: "text-orange-500",
    },
};

const getChannelConfig = (channel: string) => {
    return channelConfig[channel] || {
        icon: Zap,
        color: "text-green-500",
    };
};

interface PluginCardProps {
    provider: ProviderMetadata;
    channel: string;
    isDefault: boolean;
}

function PluginCard({ provider, channel, isDefault }: PluginCardProps) {
    const config = getChannelConfig(channel);
    const ChannelIcon = config.icon;

    return (
        <Card className="overflow-hidden transition-all duration-200 hover:shadow-lg relative">
            {/* Default Badge */}
            {isDefault && (
                <div className="absolute top-3 right-3">
                    <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs">
                        Default
                    </Badge>
                </div>
            )}

            <div className="p-5">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2.5 rounded-xl bg-primary/10 ${config.color}`}>
                        <ChannelIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-semibold truncate">
                            {provider.displayName || provider.name}
                        </h3>
                        <p className="font-mono text-xs text-muted-foreground">
                            ID: {provider.id}
                        </p>
                    </div>
                </div>

                {/* Channel & Priority */}
                <div className="flex items-center gap-2 flex-wrap mb-4">
                    <div className="flex items-center gap-1.5">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Channel:</span>
                        <Badge variant="outline">{channel}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">Priority:</span>
                        <Badge variant="secondary">{provider.priority}</Badge>
                    </div>
                </div>

                {/* Recipient Fields */}
                {provider.recipientFields?.length > 0 && (
                    <div className="space-y-2 mb-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>Recipient Fields:</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {provider.recipientFields.map((field) => (
                                <Badge
                                    key={field.name}
                                    variant={field.required ? "default" : "secondary"}
                                    className="font-mono text-xs"
                                >
                                    {field.name}{field.required && "*"}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Content Fields */}
                {provider.contentFields?.length > 0 && (
                    <div className="space-y-2 mb-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FileText className="h-4 w-4" />
                            <span>Content Fields:</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {provider.contentFields.map((field) => (
                                <Badge
                                    key={field.name}
                                    variant={field.required ? "default" : "secondary"}
                                    className="font-mono text-xs"
                                >
                                    {field.name}{field.required && "*"}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Description */}
                {provider.description && (
                    <p className="text-sm text-muted-foreground italic mt-3">
                        {provider.description}
                    </p>
                )}
            </div>
        </Card>
    );
}

function PluginCardSkeleton() {
    return (
        <Card className="overflow-hidden">
            <div className="p-4 sm:p-6">
                <div className="flex items-start gap-4">
                    <Skeleton className="h-12 w-12 rounded-xl" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-5 w-5" />
                </div>
            </div>
        </Card>
    );
}

export default function PluginsPage() {
    const [channelFilter, setChannelFilter] = useState<string>("all");

    const { data, isLoading, error, mutate } = useSWR<PluginsResponse>(
        "/api/plugins",
        fetcher,
        { refreshInterval: 30000 }
    );

    // Flatten channels into a list of providers with channel info
    const allProviders = useMemo(() => {
        if (!data?.channels) return [];

        const providers: Array<{ provider: ProviderMetadata; channel: string; isDefault: boolean }> = [];

        for (const [channel, channelData] of Object.entries(data.channels)) {
            for (const provider of channelData.providers) {
                providers.push({
                    provider,
                    channel,
                    isDefault: channelData.default === provider.id
                });
            }
        }

        return providers;
    }, [data]);

    // Get available channels for filter
    const availableChannels = useMemo(() => {
        if (!data?.channels) return [];
        return Object.keys(data.channels);
    }, [data]);

    // Filter providers by selected channel
    const filteredProviders = useMemo(() => {
        if (channelFilter === "all") return allProviders;
        return allProviders.filter(p => p.channel === channelFilter);
    }, [allProviders, channelFilter]);

    const channelCount = data?.channels ? Object.keys(data.channels).length : 0;

    return (
        <DashboardLayout
            title="Plugins"
            description="Installed notification providers and their status"
        >
            <div className="space-y-6">
                {/* Toolbar */}
                <PageToolbar>
                    <PageToolbarSection>
                        <div className="flex items-center gap-2 text-sm">
                            <Puzzle className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                                {isLoading ? (
                                    <Skeleton className="h-4 w-48 inline-block" />
                                ) : (
                                    `${allProviders.length} plugin(s) installed • ${channelCount} channel(s) available`
                                )}
                            </span>
                        </div>
                    </PageToolbarSection>

                    <PageToolbarSpacer />

                    <PageToolbarSection>
                        <Select value={channelFilter} onValueChange={setChannelFilter}>
                            <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder="Channel" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Channels</SelectItem>
                                {availableChannels.map((ch) => (
                                    <SelectItem key={ch} value={ch}>
                                        {ch.charAt(0).toUpperCase() + ch.slice(1)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => mutate()}
                            disabled={isLoading}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </PageToolbarSection>
                </PageToolbar>

                {/* Loading State */}
                {isLoading && (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {[...Array(3)].map((_, i) => (
                            <PluginCardSkeleton key={i} />
                        ))}
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <Card className="border-destructive">
                        <CardContent className="pt-6">
                            <p className="text-destructive">Failed to load plugins. Make sure the API is running.</p>
                        </CardContent>
                    </Card>
                )}

                {/* Empty State */}
                {data && allProviders.length === 0 && (
                    <Card className="border-dashed">
                        <CardContent className="py-12 text-center">
                            <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                <Puzzle className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">No Plugins Installed</h3>
                            <p className="text-muted-foreground max-w-sm mx-auto mb-4">
                                Get started by installing your first notification plugin.
                            </p>
                            <code className="bg-muted px-3 py-1.5 rounded text-sm">
                                npm run plugin:install &lt;package-name&gt;
                            </code>
                        </CardContent>
                    </Card>
                )}

                {/* Plugin Cards */}
                {data && filteredProviders.length > 0 && (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {filteredProviders.map(({ provider, channel, isDefault }) => (
                            <PluginCard
                                key={provider.id}
                                provider={provider}
                                channel={channel}
                                isDefault={isDefault}
                            />
                        ))}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
