"use client";

import Link from "next/link";
import Image from "next/image";
import {
    Layers,
    Zap,
    LayoutDashboard,
    BookOpen,
    Github
} from "lucide-react";

export function LandingFooter() {
    const navigationLinks = [
        {
            icon: <Zap className="h-4 w-4" />,
            label: "Features",
            href: "#features",
        },
        {
            icon: <Layers className="h-4 w-4" />,
            label: "Architecture",
            href: "#architecture",
        },
    ];

    const quickLinks = [
        {
            icon: <Github className="h-4 w-4" />,
            label: "Github",
            href: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com",
        },
        {
            icon: <BookOpen className="h-4 w-4" />,
            label: "Documentation",
            href: "/docs",
        },
    ];

    return (
        <footer className="py-16 px-4 border-t border-[#FFFFFF1A] bg-black">
            <div className="max-w-6xl mx-auto">
                {/* Main Footer Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    {/* Brand Section */}
                    <div className="flex flex-col gap-4">
                        <Image
                            src="/SimpleNSLogo.png"
                            alt="SimpleNS"
                            width={140}
                            height={45}
                        />
                        <p className="text-sm text-slate-400 max-w-xs">
                            Simple. Scalable. Notifications.
                        </p>
                    </div>

                    {/* Navigation Links */}
                    <div className="flex flex-col gap-4">
                        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                            Navigation
                        </h3>
                        <ul className="flex flex-col gap-3">
                            {navigationLinks.map((link) => (
                                <li key={link.label}>
                                    <a
                                        href={link.href}
                                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors group"
                                    >
                                        <span className="text-slate-500 group-hover:text-blue-400 transition-colors">
                                            {link.icon}
                                        </span>
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Quick Links */}
                    <div className="flex flex-col gap-4">
                        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                            Quick Links
                        </h3>
                        <ul className="flex flex-col gap-3">
                            {quickLinks.map((link) => (
                                <li key={link.label}>
                                    <Link
                                        href={link.href}
                                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors group"
                                    >
                                        <span className="text-slate-500 group-hover:text-blue-400 transition-colors">
                                            {link.icon}
                                        </span>
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </footer>
    );
}
