"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import useSWR from "swr";
import { Puzzle, Key, Zap, FileText, User } from "lucide-react";
import { useMemo } from "react";

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

function PluginCard({ provider, channel, isDefault }: { provider: ProviderMetadata; channel: string; isDefault: boolean }) {
    return (
        <Card className="relative overflow-hidden">
            {isDefault && (
                <div className="absolute top-3 right-3">
                    <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">
                        Default
                    </Badge>
                </div>
            )}
            <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                        <Puzzle className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">
                            {provider.displayName || provider.name}
                        </CardTitle>
                        <CardDescription className="font-mono text-xs">
                            ID: {provider.id}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
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

                {provider.recipientFields?.length > 0 && (
                    <div className="space-y-2">
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
                                    {field.name}{field.required ? "*" : ""}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {provider.contentFields?.length > 0 && (
                    <div className="space-y-2">
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
                                    {field.name}{field.required ? "*" : ""}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {provider.description && (
                    <p className="text-sm text-muted-foreground italic">
                        {provider.description}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function PluginCardSkeleton() {
    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-3 w-48" />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-6 w-full" />
            </CardContent>
        </Card>
    );
}

export default function PluginsPage() {
    const { data, isLoading, error } = useSWR<PluginsResponse>(
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

    const channelCount = data?.channels ? Object.keys(data.channels).length : 0;

    return (
        <DashboardLayout
            title="Plugins"
            description="Installed notification providers and their status"
        >
            {isLoading && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[...Array(3)].map((_, i) => (
                        <PluginCardSkeleton key={i} />
                    ))}
                </div>
            )}

            {error && (
                <Card className="border-destructive">
                    <CardContent className="pt-6">
                        <p className="text-destructive">Failed to load plugins. Make sure the API is running.</p>
                    </CardContent>
                </Card>
            )}

            {data && allProviders.length === 0 && (
                <Card>
                    <CardContent className="pt-6 text-center">
                        <Puzzle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Plugins Installed</h3>
                        <p className="text-muted-foreground">
                            Install plugins using: <code className="bg-muted px-2 py-1 rounded">npm run plugin:install &lt;package-name&gt;</code>
                        </p>
                    </CardContent>
                </Card>
            )}

            {data && allProviders.length > 0 && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {allProviders.length} plugin(s) installed • {channelCount} channel(s) available
                        </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {allProviders.map(({ provider, channel, isDefault }) => (
                            <PluginCard
                                key={provider.id}
                                provider={provider}
                                channel={channel}
                                isDefault={isDefault}
                            />
                        ))}
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
