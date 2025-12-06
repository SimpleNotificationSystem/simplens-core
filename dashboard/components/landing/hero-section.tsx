"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LaserFlow } from "@/components/LaserFlow";
import { ArrowRight } from "lucide-react";

export function HeroSection() {
    return (
        <section className="relative w-full bg-[#030303] overflow-hidden">
            <div className="flex flex-col lg:flex-row min-h-screen">

                {/* Left Side - Content (40%) */}
                <div className="w-full lg:w-[40%] flex items-center justify-center lg:justify-start px-6 sm:px-10 lg:pl-20 py-20 lg:py-0 relative z-20">
                    <div className="max-w-md text-center lg:text-left">
                        <Image
                            src="/SimpleNSLogo.png"
                            alt="SimpleNS"
                            width={220}
                            height={80}
                            className="mb-8 mx-auto lg:mx-0"
                            priority
                        />

                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-6 leading-tight">
                            Simple. Scalable.{" "}
                            <span className="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                                Notifications.
                            </span>
                        </h1>

                        <p className="text-base sm:text-lg text-zinc-400 mb-8 leading-relaxed">
                            A lightweight backend notification service for Email and WhatsApp with scheduled delivery, automatic retries, and real-time status updates.
                        </p>

                        <Link href="/login">
                            <Button
                                size="lg"
                                className="text-base px-8 gap-2 bg-white text-black border-0"
                            >
                                Get Started
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Right Side - Laser & Dashboard (60%) */}
                <div className="hidden lg:flex w-full lg:w-[60%] relative flex-col items-center justify-end h-[60vh] lg:h-auto">

                    {/* LaserFlow Background for Right Side */}
                    <div className="absolute inset-0 z-0">
                        <LaserFlow
                            horizontalBeamOffset={0}
                            verticalBeamOffset={0}
                            color="#1652b3"
                            flowSpeed={0.4}
                            fogIntensity={0.6}
                            wispDensity={1.2}
                            verticalSizing={1.0}
                            horizontalSizing={0.8}
                            className="w-full h-full"
                        />
                    </div>

                    {/* Dashboard Preview - Aligned to bottom of right side */}
                    <div className="relative z-10 w-[90%] max-w-2xl mb-[-10%] lg:mb-20">
                        <div
                            className="rounded-xl overflow-hidden relative"
                        >
                            {/* Dotted pattern */}
                            <div
                                className="absolute inset-0 opacity-20 pointer-events-none"
                            />

                            <Image
                                src="/DashboardUI.png"
                                alt="SimpleNS Dashboard Preview"
                                width={1200}
                                height={675}
                                className="w-full h-auto relative z-10 opacity-90"
                                priority
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
