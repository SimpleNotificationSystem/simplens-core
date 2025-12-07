"use client";

import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { MobileMenuButton } from "./docs-sidebar";

interface DocsNavbarProps {
    onMenuClick: () => void;
}

export function DocsNavbar({ onMenuClick }: DocsNavbarProps) {
    return (
        <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
            <div className="flex h-14 items-center px-4 md:px-6">
                <MobileMenuButton onClick={onMenuClick} />

                <Link href="/" className="flex items-center gap-2 ml-2 lg:ml-0">
                    <Image
                        src="/SimpleNSLogo.png"
                        alt="SimpleNS"
                        width={100}
                        height={32}
                        priority
                    />
                    <span className="hidden sm:inline-block text-sm font-medium text-muted-foreground border-l pl-2 ml-1">
                        Docs
                    </span>
                </Link>

                <div className="flex-1" />

                <nav className="flex items-center gap-2">
                    <ThemeToggle />
                    <Link href="/login">
                        <Button size="sm">
                            Dashboard
                        </Button>
                    </Link>
                </nav>
            </div>
        </header>
    );
}
