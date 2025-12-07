"use client";

import { useState } from "react";
import { DocsNavbar } from "./docs-navbar";
import { DocsSidebar, MobileSidebar } from "./docs-sidebar";

interface DocsLayoutProps {
    children: React.ReactNode;
}

export function DocsLayout({ children }: DocsLayoutProps) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <div className="min-h-screen bg-background">
            <DocsNavbar onMenuClick={() => setIsMobileMenuOpen(true)} />

            <div className="flex">
                {/* Desktop Sidebar - Fixed on left */}
                <DocsSidebar className="hidden lg:block sticky top-14 h-[calc(100vh-3.5rem)] border-r" />

                {/* Mobile Sidebar */}
                <MobileSidebar
                    isOpen={isMobileMenuOpen}
                    onClose={() => setIsMobileMenuOpen(false)}
                />

                {/* Main Content */}
                <main className="flex-1 px-4 md:px-8 lg:px-12 py-8 min-w-0">
                    <div className="prose prose-zinc dark:prose-invert max-w-4xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
