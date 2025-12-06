"use client";

import * as React from "react";
import { Moon, Sun, Palette } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

// Original theme toggle for header use
export function ThemeToggle() {
    const { setTheme } = useTheme();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                    <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">Toggle theme</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}>
                    Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                    Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                    System
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// Sidebar-friendly theme toggle that looks like other menu items
export function SidebarThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    // Avoid hydration mismatch
    React.useEffect(() => {
        setMounted(true);
    }, []);

    // Show a neutral icon while mounting to avoid hydration issues
    const ThemeIcon = mounted
        ? theme === "dark"
            ? Moon
            : theme === "light"
                ? Sun
                : Palette // system
        : Palette;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                    <ThemeIcon className="h-4 w-4" />
                    <span>Theme</span>
                </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem onClick={() => setTheme("light")}>
                    <Sun className="h-4 w-4 mr-2" />
                    Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                    <Moon className="h-4 w-4 mr-2" />
                    Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                    <Palette className="h-4 w-4 mr-2" />
                    System
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
