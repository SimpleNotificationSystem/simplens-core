"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import useSWR from "swr";
import {
    LayoutDashboard,
    Bell,
    AlertTriangle,
    ShieldAlert,
    BarChart3,
    Settings,
    Send,
    Puzzle,
    FileText,
    Code,
    BellRing,
} from "lucide-react";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarFooter,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarInset,
    SidebarTrigger,
    SidebarMenuBadge,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import type { DashboardStats } from "@/lib/types";
import { withBasePath } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
const fetcher = <T,>(url: string): Promise<T> => apiClient.get(url) as unknown as Promise<T>;

interface NavItem {
    title: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeKey?: "failed" | "alerts";
}

interface NavCategory {
    label: string;
    items: NavItem[];
}

const navCategories: NavCategory[] = [
    {
        label: "Notifications",
        items: [
            { title: "Send", href: "/send", icon: Send },
            { title: "Events", href: "/events", icon: Bell },
            { title: "Failed", href: "/failed", icon: AlertTriangle, badgeKey: "failed" },
            { title: "Alerts", href: "/alerts", icon: ShieldAlert, badgeKey: "alerts" },
        ],
    },
    {
        label: "Insights",
        items: [
            { title: "Analytics", href: "/analytics", icon: BarChart3 },
        ],
    },
    {
        label: "Tools",
        items: [
            { title: "Plugins", href: "/plugins", icon: Puzzle },
            { title: "Templates", href: "/templates", icon: FileText },
            { title: "Payload Studio", href: "/payload-studio", icon: Code },
        ],
    },
    {
        label: "System",
        items: [
            { title: "Admin Alerts", href: "/admin-alerts", icon: BellRing },
        ],
    },
];

const settingsItems = [
    {
        title: "Settings",
        href: "/settings",
        icon: Settings,
    },
];

function AppSidebar() {
    const pathname = usePathname();

    // Fetch counts for badges
    const { data: stats } = useSWR<DashboardStats>(
        "/api/dashboard/stats",
        fetcher,
        { refreshInterval: 30000 }
    );

    const { data: alertStats } = useSWR<{ count: number }>(
        "/api/alerts",
        fetcher,
        { refreshInterval: 30000 }
    );

    const badgeCounts = {
        failed: stats?.failed ?? 0,
        alerts: alertStats?.count ?? 0,
    };

    return (
        <Sidebar>
            <SidebarHeader>
                <Link href={withBasePath("/dashboard")} className="flex items-center gap-3 px-2 py-2" data-tour="sidebar-header">
                    <Image
                        src="/SimpleNSLogo.png"
                        alt="SimpleNS Logo"
                        width={130}
                        height={120}
                        className="rounded-lg"
                        preload={true}
                    />
                </Link>
            </SidebarHeader>
            <SidebarContent>
                {/* Standalone Dashboard item */}
                <SidebarGroup className="pb-0">
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem data-tour="nav-dashboard">
                                <SidebarMenuButton asChild isActive={pathname === withBasePath("/dashboard")}>
                                    <Link href={withBasePath("/dashboard")}>
                                        <LayoutDashboard className="h-4 w-4" />
                                        <span>Dashboard</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {/* Categories */}
                {navCategories.map((category) => (
                    <SidebarGroup key={category.label} className="py-0">
                        <SidebarGroupLabel>{category.label}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {category.items.map((item) => {
                                    const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
                                    const itemHref = withBasePath(item.href);
                                    return (
                                        <SidebarMenuItem key={item.href} data-tour={`nav-${item.href.slice(1)}`}>
                                            <SidebarMenuButton asChild isActive={pathname === itemHref || (item.href !== "/dashboard" && pathname.startsWith(itemHref))}>
                                                <Link href={itemHref}>
                                                    <item.icon className="h-4 w-4" />
                                                    <span>{item.title}</span>
                                                </Link>
                                            </SidebarMenuButton>
                                            {item.badgeKey && count > 0 && (
                                                <SidebarMenuBadge
                                                    className={
                                                        item.badgeKey === "failed"
                                                            ? "bg-red-500 text-white"
                                                            : "bg-yellow-500 text-black"
                                                    }
                                                >
                                                    {count > 99 ? "99+" : count}
                                                </SidebarMenuBadge>
                                            )}
                                        </SidebarMenuItem>
                                    );
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenu>
                    {settingsItems.map((item) => {
                        const itemHref = withBasePath(item.href);
                        return (
                            <SidebarMenuItem key={item.href} data-tour={`nav-${item.href.slice(1)}`}>
                                <SidebarMenuButton asChild isActive={pathname === itemHref}>
                                    <Link href={itemHref}>
                                        <item.icon className="h-4 w-4" />
                                        <span>{item.title}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    })}
                    <SidebarMenuItem data-tour="theme-toggle">
                        <SidebarThemeToggle />
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <LogoutButton />
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}

interface DashboardLayoutProps {
    children: React.ReactNode;
    title: string;
    description?: string;
}

export function DashboardLayout({ children, title, description }: DashboardLayoutProps) {
    const pathname = usePathname();

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <div>
                        <h1 className="text-lg font-semibold">{title}</h1>
                        {description && (
                            <p className="text-sm text-muted-foreground">{description}</p>
                        )}
                    </div>
                </header>
                <motion.main
                    key={pathname}
                    className="flex-1 overflow-y-auto p-4 will-change-[transform,opacity,filter]"
                    initial={{ opacity: 0, y: 18, scale: 0.985, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                >
                    {children}
                </motion.main>
            </SidebarInset>
        </SidebarProvider>
    );
}
