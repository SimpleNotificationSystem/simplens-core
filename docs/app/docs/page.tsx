import Link from "next/link";
import Image from "next/image";
import {
    Mail,
    MessageSquare,
    Clock,
    Zap,
    Shield,
    RefreshCw,
    ArrowRight,
    Layers,
    Code2,
    Rocket,
    Scale,
    BarChart3,
    LayoutDashboard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocsCallout } from "@/components/docs/docs-callout";
import { DocsNavGrid } from "@/components/docs/docs-nav-grid";

export default function DocsOverviewPage() {
    return (
        <div className="space-y-12">
            {/* Hero Section */}
            <section className="text-center py-8 border-b">
                <div className="flex justify-center mb-6">
                    <Image
                        src="/SimpleNSLogo.png"
                        alt="SimpleNS"
                        width={280}
                        height={60}
                        priority
                    />
                </div>
                <h1 className="text-4xl font-bold tracking-tight mb-4">
                    SimpleNS Documentation
                </h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                    A lightweight, high-performance backend notification service for sending
                    <strong className="text-foreground"> Email</strong> and
                    <strong className="text-foreground"> WhatsApp</strong> messages at scale.
                </p>
                <div className="flex items-center justify-center gap-4 mt-8">
                    <Link href="/docs/getting-started">
                        <Button size="lg" className="gap-2">
                            <Rocket className="h-4 w-4" />
                            Get Started
                        </Button>
                    </Link>
                    <Link href="/docs/api-reference">
                        <Button variant="outline" size="lg" className="gap-2">
                            <Code2 className="h-4 w-4" />
                            API Reference
                        </Button>
                    </Link>
                </div>
            </section>

            {/* What is SimpleNS */}
            <section>
                <h2 className="text-2xl font-bold mb-4">What is SimpleNS?</h2>
                <p className="text-muted-foreground mb-4">
                    SimpleNS (Simple Notification Service) is a scalable event-driven notification
                    service built with Node.js. It provides a REST API for accepting notification requests
                    and delivers them asynchronously using pluggable providers for Email (SMTP) and WhatsApp.
                </p>
                <p className="text-muted-foreground mb-4">
                    The service is designed for high throughput and reliability, featuring automatic retries,
                    dead letter queues, rate limiting, and horizontal scaling capabilities.
                </p>
                <p className="text-muted-foreground">
                    <strong className="text-foreground">Maximum Delivery Guarantee:</strong> SimpleNS uses the
                    <em> transactional outbox pattern</em> to ensure no notification is ever lost. Every request
                    is first persisted to MongoDB before being published to Kafka. Combined with automatic retries
                    with exponential backoff, idempotency checks to prevent duplicates, and a dedicated dead letter
                    queue for inspection and manual retry, the system guarantees that notifications are either
                    successfully delivered or explicitly flagged for attention.
                </p>
            </section>

            {/* Key Features */}
            <section>
                <h2 className="text-2xl font-bold mb-6">Key Features</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FeatureCard
                        icon={Mail}
                        title="Multi-Channel"
                        description="Send notifications via Email and WhatsApp from a single API"
                    />
                    <FeatureCard
                        icon={Clock}
                        title="Scheduled Delivery"
                        description="Schedule notifications for future delivery with timezone support"
                    />
                    <FeatureCard
                        icon={Zap}
                        title="Batch Processing"
                        description="Send to thousands of recipients with template variable support"
                    />
                    <FeatureCard
                        icon={Shield}
                        title="Idempotency"
                        description="Safe retries without duplicate deliveries using request IDs"
                    />
                    <FeatureCard
                        icon={RefreshCw}
                        title="Auto Retries"
                        description="Automatic retry with exponential backoff for failed deliveries"
                    />
                    <FeatureCard
                        icon={MessageSquare}
                        title="Webhook Callbacks"
                        description="Real-time delivery status updates via HTTP callbacks"
                    />
                </div>
            </section>

            {/* Quick Navigation */}
            <section>
                <h2 className="text-2xl font-bold mb-6">Explore the Docs</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <NavCard
                        href="/docs/architecture"
                        icon={Layers}
                        title="Architecture"
                        description="Understand the system design, components, and data flow"
                    />
                    <NavCard
                        href="/docs/api-reference"
                        icon={Code2}
                        title="API Reference"
                        description="Complete API documentation with examples"
                    />
                    <NavCard
                        href="/docs/getting-started"
                        icon={Rocket}
                        title="Getting Started"
                        description="Set up SimpleNS locally or with Docker"
                    />
                    <NavCard
                        href="/docs/configuration"
                        icon={Shield}
                        title="Configuration"
                        description="Environment variables and setup options"
                    />
                    <NavCard
                        href="/docs/scaling"
                        icon={Scale}
                        title="Scaling"
                        description="Horizontal scaling and high throughput configuration"
                    />
                    <NavCard
                        href="/docs/monitoring"
                        icon={BarChart3}
                        title="Monitoring"
                        description="Grafana, Loki, and observability setup"
                    />
                    <NavCard
                        href="/docs/admin-dashboard"
                        icon={LayoutDashboard}
                        title="Admin Dashboard"
                        description="Web UI for monitoring and managing notifications"
                    />
                </div>
            </section>

            {/* Tech Stack */}
            <section>
                <h2 className="text-2xl font-bold mb-4">Technology Stack</h2>
                <DocsCallout type="note" title="Built with Modern Technologies">
                    SimpleNS leverages a robust technology stack designed for performance and reliability.
                </DocsCallout>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    <TechBadge
                        name="Node.js"
                        description="Runtime"
                        logo="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg"
                    />
                    <TechBadge
                        name="Express"
                        description="API Framework"
                        logo="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/express/express-original.svg"
                        darkInvert
                    />
                    <TechBadge
                        name="Apache Kafka"
                        description="Message Queue"
                        logo="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/apachekafka/apachekafka-original.svg"
                        darkInvert
                    />
                    <TechBadge
                        name="MongoDB"
                        description="Database"
                        logo="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mongodb/mongodb-original.svg"
                    />
                    <TechBadge
                        name="Redis"
                        description="Caching & Rate Limiting"
                        logo="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/redis/redis-original.svg"
                    />
                    <TechBadge
                        name="Docker"
                        description="Containerization"
                        logo="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/docker/docker-original.svg"
                    />
                    <TechBadge
                        name="Grafana"
                        description="Monitoring"
                        logo="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/grafana/grafana-original.svg"
                    />
                    <TechBadge
                        name="TypeScript"
                        description="Language"
                        logo="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg"
                    />
                </div>
            </section>
            <DocsNavGrid title="Continue Learning" items={[
                {
                    link: "/docs/architecture",
                    heading: "Architecture",
                    subtitle: "Understand the architecture of SimpleNS",
                },
                {
                    link: "/docs/api-reference",
                    heading: "API Reference",
                    subtitle: "Explore the API reference for SimpleNS",
                },
                {
                    link: "/docs/getting-started",
                    heading: "Getting Started",
                    subtitle: "Learn how to get started with SimpleNS",
                },
            ]} />
        </div>
    );
}

function FeatureCard({
    icon: Icon,
    title,
    description,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
}) {
    return (
        <div className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h3 className="font-semibold mb-1">{title}</h3>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>
        </div>
    );
}

function NavCard({
    href,
    icon: Icon,
    title,
    description,
}: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
}) {
    return (
        <Link
            href={href}
            className="group p-4 rounded-lg border bg-card hover:border-primary/50 hover:bg-accent/50 transition-all"
        >
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{title}</h3>
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{description}</p>
                </div>
            </div>
        </Link>
    );
}

function TechBadge({ name, description, logo, darkInvert }: { name: string; description: string; logo: string; darkInvert?: boolean }) {
    return (
        <div className="p-4 rounded-lg border text-center hover:bg-accent/50 transition-colors flex flex-col items-center gap-2">
            <Image
                src={logo}
                alt={name}
                width={40}
                height={40}
                className={darkInvert ? "dark:invert" : ""}
            />
            <div>
                <p className="font-semibold text-sm">{name}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}
