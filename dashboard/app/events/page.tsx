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
import { format } from "date-fns";
import type { PaginatedResponse, Notification, NOTIFICATION_STATUS, CHANNEL } from "@/lib/types";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function EventsPage() {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<string>("all");
    const [channel, setChannel] = useState<string>("all");
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [sortBy, setSortBy] = useState<string>("created_at_desc");

    const buildUrl = () => {
        const params = new URLSearchParams();
        params.set("page", page.toString());
        params.set("limit", "15");
        if (status !== "all") params.set("status", status);
        if (channel !== "all") params.set("channel", channel);
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
            <div className="space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
                        <Input
                            placeholder="Search by request ID, email, phone..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <Button onClick={handleSearch} size="icon" variant="outline">
                            <Search className="h-4 w-4" />
                        </Button>
                    </div>

                    <Select value={status} onValueChange={handleStatusChange}>
                        <SelectTrigger className="w-[150px]">
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
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Channel" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Channels</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={sortBy} onValueChange={handleSortChange}>
                        <SelectTrigger className="w-[180px]">
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
                </div>

                {/* Table */}
                <div className="rounded-md border">
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
                                            {notification.recipient.email || notification.recipient.phone}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={notification.status} />
                                        </TableCell>
                                        <TableCell>{notification.retry_count}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {format(new Date(notification.created_at), "MMM d, HH:mm")}
                                        </TableCell>
                                        <TableCell>
                                            <Link href={`/events/${notification._id}`}>
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
                            {[...Array(Math.min(5, data.totalPages))].map((_, i) => {
                                const pageNum = i + 1;
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
                            })}
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
