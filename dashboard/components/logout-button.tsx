"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function LogoutButton() {
    const handleLogout = async () => {
        await signOut({ redirect: false });
        window.location.href = "/login";
    };

    return (
        <SidebarMenuButton onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
        </SidebarMenuButton>
    );
}
