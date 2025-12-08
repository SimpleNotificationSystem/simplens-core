"use client";

import Link from "next/link";

interface NavItem {
    link: string;
    heading: string;
    subtitle: string;
}

interface DocsNavGridProps {
    title?: string;
    items: NavItem[];
}

/**
 * A reusable navigation grid component for documentation pages.
 * Displays a set of navigation cards in a responsive grid layout.
 */
export function DocsNavGrid({ title = "Continue Learning", items }: DocsNavGridProps) {
    return (
        <section className="border-t pt-8">
            <h2 className="text-2xl font-bold mb-4">{title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {items.map((item, index) => (
                    <Link
                        key={index}
                        href={item.link}
                        className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors"
                    >
                        <h3 className="font-semibold mb-1">{item.heading} →</h3>
                        <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                    </Link>
                ))}
            </div>
        </section>
    );
}
