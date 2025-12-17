"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
    LayoutDashboard,
    Bell,
    AlertTriangle,
    ShieldAlert,
    BarChart3,
    Settings,
    Send,
    Book,
} from "lucide-react";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
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

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface NavItem {
    title: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeKey?: "failed" | "alerts";
}

const navItems: NavItem[] = [
    {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
    },
    {
        title: "Send",
        href: "/send",
        icon: Send,
    },
    {
        title: "Events",
        href: "/events",
        icon: Bell,
    },
    {
        title: "Failed",
        href: "/failed",
        icon: AlertTriangle,
        badgeKey: "failed",
    },
    {
        title: "Alerts",
        href: "/alerts",
        icon: ShieldAlert,
        badgeKey: "alerts",
    },
    {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3,
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
                <Link href="/" className="flex items-center gap-3 px-2 py-2">
                    <Image
                        src="/SimpleNSLogo.png"
                        alt="SimpleNS Logo"
                        width={130}
                        height={120}
                        className="rounded-lg"
                    />
                </Link>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {navItems.map((item) => {
                                const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
                                return (
                                    <SidebarMenuItem key={item.href}>
                                        <SidebarMenuButton asChild isActive={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))}>
                                            <Link href={item.href}>
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
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenu>
                    {settingsItems.map((item) => (
                        <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton asChild isActive={pathname === item.href}>
                                <Link href={item.href}>
                                    <item.icon className="h-4 w-4" />
                                    <span>{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                    <SidebarMenuItem>
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
                <main className="flex-1 overflow-y-auto p-4">
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
