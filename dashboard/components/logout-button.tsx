"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function LogoutButton() {
    const router = useRouter();

    const handleLogout = async () => {
        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/logout`,
                { method: "POST" }
            );

            if (response.ok) {
                router.push(`/login`);
                router.refresh();
            }
        } catch (error) {
            console.error("Logout failed:", error);
            // Force redirect even on error
            window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login`;
        }
    };

    return (
        <SidebarMenuButton onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
        </SidebarMenuButton>
    );
}
