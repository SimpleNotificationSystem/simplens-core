"use client";

import Link from "next/link";
import Image from "next/image";
import { Layers, Zap } from "lucide-react";

export function LandingFooter() {
    const currentYear = new Date().getFullYear();

    const sectionLinks = [
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

    return (
        <footer className="py-16 px-4 border-t border-[#FFFFFF1A] bg-black">
            <div className="max-w-6xl mx-auto">
                {/* Main Footer Content */}
                <div className="flex flex-col items-center gap-8">
                    {/* Logo */}
                    <Image
                        src="/SimpleNSLogo.png"
                        alt="SimpleNS"
                        width={140}
                        height={45}
                    />

                    {/* Tagline */}
                    <p className="text-lg text-slate-400 text-center max-w-md">
                        Simple. Scalable. Notifications.
                    </p>

                    {/* Section Links */}
                    <div className="flex items-center gap-8">
                        {sectionLinks.map((link) => (
                            <a
                                key={link.label}
                                href={link.href}
                                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                            >
                                {link.icon}
                                <span>{link.label}</span>
                            </a>
                        ))}
                    </div>

                    {/* Divider */}
                    <div className="w-full max-w-xs h-px bg-white/10"></div>

                    {/* Copyright */}
                    <p className="text-sm text-slate-500">
                        © {currentYear} SimpleNS. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}
