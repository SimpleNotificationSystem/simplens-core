"use client";

import { FeatureSection } from "@/components/landing/feature-section";
import { ArchitectureSection } from "@/components/landing/architecture-section";
import { LandingFooter } from "@/components/landing/landing-footer";
import { HeroSection } from "@/components/landing/hero-section";
import { HeroHeader } from "@/components/landing/hero-header";

export default function LandingPage() {
    return (
        <main className="min-h-screen">
            <HeroHeader />
            <HeroSection />
            <FeatureSection />
            <ArchitectureSection />
            <LandingFooter />
        </main>
    );
}
