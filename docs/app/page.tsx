"use client";

import { LandingNavbar } from "@/components/landing/landing-navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { FeatureSection } from "@/components/landing/feature-section";
import { ArchitectureSection } from "@/components/landing/architecture-section";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function LandingPage() {
    return (
        <main className="min-h-screen">
            <LandingNavbar />
            <HeroSection />
            <FeatureSection />
            <ArchitectureSection />
            <LandingFooter />
        </main>
    );
}
