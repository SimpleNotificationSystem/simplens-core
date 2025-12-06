"use client";

import Link from "next/link";
import Image from "next/image";
import {LayoutDashboard } from "lucide-react";

export function LandingFooter() {
    const currentYear = new Date().getFullYear();

    const links = [
        {
            icon: <LayoutDashboard className="h-4 w-4" />,
            label: "Dashboard",
            href: "/dashboard",
        },
    ];

    return (
        <footer className="py-12 px-4 border-t border-border/50 bg-muted/20">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    {/* Logo & Copyright */}
                    <div className="flex items-center gap-3">
                        <Image
                            src="/SimpleNSLogo.png"
                            alt="SimpleNS"
                            width={100}
                            height={35}
                        />
                        <span className="text-sm text-muted-foreground">
                            © {currentYear} SimpleNS
                        </span>
                    </div>

                    {/* Links */}
                    <div className="flex items-center gap-6">
                        {links.map((link) => (
                            <Link
                                key={link.label}
                                href={link.href}
                                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                target={link.href.startsWith("http") ? "_blank" : undefined}
                                rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                            >
                                {link.icon}
                                <span className="hidden sm:inline">{link.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Tagline */}
                <p className="text-center text-sm text-muted-foreground mt-8">
                    Simple. Scalable. Notifications.
                </p>
            </div>
        </footer>
    );
}
