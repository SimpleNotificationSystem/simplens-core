"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { withBasePath } from "@/lib/utils";

export function LogoutButton() {
    const router = useRouter();

    const handleLogout = async () => {
        try {
            const response = await fetch(
                withBasePath("/api/auth/logout"),
                { method: "POST" }
            );

            if (response.ok) {
                router.push(withBasePath(`/login`));
                router.refresh();
            }
        } catch (error) {
            console.error("Logout failed:", error);
            // Force redirect even on error
            window.location.href = withBasePath("/login");
        }
    };

    return (
        <SidebarMenuButton onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
        </SidebarMenuButton>
    );
}
