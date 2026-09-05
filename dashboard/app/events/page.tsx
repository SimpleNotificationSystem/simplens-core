"use client";

import { useState } from "react";
import useSWR from "swr";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatusBadge } from "@/components/events/status-badge";
import { ChannelBadge } from "@/components/events/channel-badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { Search, Eye, RefreshCw, ArrowUpDown } from "lucide-react";
import { PageToolbar, PageToolbarSection } from "@/components/ui/page-toolbar";
import { format } from "date-fns";
import type { PaginatedResponse, Notification, PluginMetadata } from "@/lib/types";
import Link from "next/link";
import { withBasePath } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
const fetcher = <T,>(url: string): Promise<T> => apiClient.get(url) as unknown as Promise<T>;

export default function EventsPage() {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<string>("all");
    const [channel, setChannel] = useState<string>("all");
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [sortBy, setSortBy] = useState<string>("created_at_desc");

    // Fetch available channels from plugins
    const { data: pluginsData } = useSWR<PluginMetadata>('/api/plugins', fetcher);
    const availableChannels = pluginsData ? Object.keys(pluginsData.channels) : [];

    // Provider filter state
    const [provider, setProvider] = useState<string>("all");
    const availableProviders = channel !== "all" && pluginsData?.channels[channel]
        ? pluginsData.channels[channel].providers
        : [];

    const buildUrl = () => {
        const params = new URLSearchParams();
        params.set("page", page.toString());
        params.set("limit", "15");
        if (status !== "all") params.set("status", status);
        if (channel !== "all") params.set("channel", channel);
        if (provider !== "all") params.set("provider", provider);
        if (search) params.set("search", search);
        params.set("sortBy", sortBy);
        return `/api/notifications?${params.toString()}`;
    };

    const { data, isLoading, error, mutate } = useSWR<PaginatedResponse<Notification>>(
        buildUrl(),
        fetcher
    );

    const handleSearch = () => {
        setSearch(searchInput);
        setPage(1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSearch();
        }
    };

    const handleStatusChange = (value: string) => {
        setStatus(value);
        setPage(1);
    };

    const handleChannelChange = (value: string) => {
        setChannel(value);
        setProvider("all"); // Reset provider when channel changes
        setPage(1);
    };

    const handleProviderChange = (value: string) => {
        setProvider(value);
        setPage(1);
    };

    const handleSortChange = (value: string) => {
        setSortBy(value);
        setPage(1);
    };

    return (
        <DashboardLayout
            title="Events"
            description="Browse and search all notification events"
        >
            <div className="space-y-6">
                {/* Toolbar */}
                <PageToolbar className="flex-col sm:flex-row gap-3">
                    <PageToolbarSection className="w-full sm:w-auto sm:flex-1 sm:max-w-md">
                        <Input
                            placeholder="Search by notification ID, request ID, client ID/name..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="flex-1"
                        />
                        <Button onClick={handleSearch} size="icon" variant="outline">
                            <Search className="h-4 w-4" />
                        </Button>
                    </PageToolbarSection>

                    <PageToolbarSection className="w-full sm:w-auto flex-wrap">
                        <Select value={status} onValueChange={handleStatusChange}>
                            <SelectTrigger className="w-[120px] sm:w-[130px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="processing">Processing</SelectItem>
                                <SelectItem value="delivered">Delivered</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={channel} onValueChange={handleChannelChange}>
                            <SelectTrigger className="w-[120px] sm:w-[140px]">
                                <SelectValue placeholder="Channel" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Channels</SelectItem>
                                {availableChannels.map((ch) => (
                                    <SelectItem key={ch} value={ch} className="capitalize">
                                        {ch.charAt(0).toUpperCase() + ch.slice(1)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {channel !== "all" && availableProviders.length > 0 && (
                            <Select value={provider} onValueChange={handleProviderChange}>
                                <SelectTrigger className="w-[140px] sm:w-40">
                                    <SelectValue placeholder="Provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Providers</SelectItem>
                                    {availableProviders.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.displayName} ({p.id})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        <Select value={sortBy} onValueChange={handleSortChange}>
                            <SelectTrigger className="w-[140px] sm:w-40">
                                <ArrowUpDown className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="created_at_desc">Created (Newest)</SelectItem>
                                <SelectItem value="created_at_asc">Created (Oldest)</SelectItem>
                                <SelectItem value="updated_at_desc">Updated (Newest)</SelectItem>
                                <SelectItem value="updated_at_asc">Updated (Oldest)</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button variant="outline" size="icon" onClick={() => mutate()}>
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </PageToolbarSection>
                </PageToolbar>

                {/* Table */}
                <div className="rounded-md border overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Request ID</TableHead>
                                <TableHead>Channel</TableHead>
                                <TableHead>Recipient</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Retry</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [...Array(10)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                                    </TableRow>
                                ))
                            ) : error || !data ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                                        Failed to load notifications
                                    </TableCell>
                                </TableRow>
                            ) : data.data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                                        No notifications found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                data.data.map((notification) => (
                                    <TableRow key={notification._id}>
                                        <TableCell className="font-mono text-xs">
                                            {notification.request_id.substring(0, 8)}...
                                        </TableCell>
                                        <TableCell>
                                            <ChannelBadge channel={notification.channel} />
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate">
                                            {(() => {
                                                // Get provider metadata for this notification's channel
                                                const channelMeta = pluginsData?.channels[notification.channel];
                                                const providerMeta = channelMeta?.providers.find(p => p.id === notification.provider)
                                                    || channelMeta?.providers.find(p => p.id === channelMeta.default)
                                                    || channelMeta?.providers[0];

                                                // Get first meaningful value from schema fields (excluding user_id for display preference)
                                                if (providerMeta?.recipientFields) {
                                                    const displayField = providerMeta.recipientFields.find(f => 
                                                        f.name !== 'user_id' && notification.recipient[f.name]
                                                    ) || providerMeta.recipientFields[0];
                                                    
                                                    if (displayField) {
                                                        const value = notification.recipient[displayField.name];
                                                        if (value !== undefined && value !== null && value !== '') {
                                                            return String(value);
                                                        }
                                                    }
                                                }
                                                // Fallback to user_id
                                                return String(notification.recipient.user_id || '');
                                            })()}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={notification.status} />
                                        </TableCell>
                                        <TableCell>{notification.retry_count}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {format(new Date(notification.created_at), "MMM d, HH:mm")}
                                        </TableCell>
                                        <TableCell>
                                            <Link href={withBasePath(`/events/${notification._id}`)}>
                                                <Button variant="ghost" size="icon">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {data && data.totalPages > 1 && (
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>
                            {(() => {
                                // Calculate sliding window around current page
                                const totalPages = data.totalPages;
                                const maxButtons = 5;
                                const startPage = Math.max(1, Math.min(page - Math.floor(maxButtons / 2), totalPages - maxButtons + 1));
                                const endPage = Math.min(totalPages, startPage + maxButtons - 1);

                                return [...Array(endPage - startPage + 1)].map((_, i) => {
                                    const pageNum = startPage + i;
                                    return (
                                        <PaginationItem key={pageNum}>
                                            <PaginationLink
                                                onClick={() => setPage(pageNum)}
                                                isActive={page === pageNum}
                                                className="cursor-pointer"
                                            >
                                                {pageNum}
                                            </PaginationLink>
                                        </PaginationItem>
                                    );
                                });
                            })()}
                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                                    className={page === data.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                )}

                {/* Results info */}
                {data && (
                    <p className="text-sm text-muted-foreground text-center">
                        Showing {data.data.length} of {data.total} notifications
                    </p>
                )}
            </div>
        </DashboardLayout>
    );
}
