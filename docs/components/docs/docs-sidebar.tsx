"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    BookOpen,
    Layers,
    Code2,
    Rocket,
    Settings,
    Scale,
    BarChart3,
    LayoutDashboard,
    ChevronRight,
    Menu,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NavItem {
    title: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
    {
        title: "Overview",
        href: "/docs",
        icon: BookOpen,
    },
    {
        title: "Architecture",
        href: "/docs/architecture",
        icon: Layers,
    },
    {
        title: "API Reference",
        href: "/docs/api-reference",
        icon: Code2,
    },
    {
        title: "Getting Started",
        href: "/docs/getting-started",
        icon: Rocket,
    },
    {
        title: "Configuration",
        href: "/docs/configuration",
        icon: Settings,
    },
    {
        title: "Scaling",
        href: "/docs/scaling",
        icon: Scale,
    },
    {
        title: "Monitoring",
        href: "/docs/monitoring",
        icon: BarChart3,
    },
    {
        title: "Admin Dashboard",
        href: "/docs/admin-dashboard",
        icon: LayoutDashboard,
    },
];

interface DocsSidebarProps {
    className?: string;
    onNavClick?: () => void;
}

export function DocsSidebar({ className, onNavClick }: DocsSidebarProps) {
    const pathname = usePathname();

    return (
        <aside className={cn("w-64 shrink-0", className)}>
            <ScrollArea className="h-full py-6 px-4">
                <div className="space-y-1">
                    <h4 className="mb-4 px-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Documentation
                    </h4>
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onNavClick}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                                    "hover:bg-accent hover:text-accent-foreground",
                                    isActive
                                        ? "bg-primary text-primary-foreground font-medium"
                                        : "text-muted-foreground"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {item.title}
                                {isActive && (
                                    <ChevronRight className="ml-auto h-4 w-4" />
                                )}
                            </Link>
                        );
                    })}
                </div>
            </ScrollArea>
        </aside>
    );
}

interface MobileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
                    onClick={onClose}
                />
            )}
            {/* Sidebar */}
            <div
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-64 bg-background border-r transform transition-transform duration-200 ease-in-out lg:hidden",
                    isOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="flex items-center justify-between p-4 border-b">
                    <span className="font-semibold">Navigation</span>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <DocsSidebar onNavClick={onClose} />
            </div>
        </>
    );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
    return (
        <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClick}
        >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
        </Button>
    );
}
