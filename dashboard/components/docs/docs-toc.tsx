"use client";

interface TocItem {
    id: string;
    label: string;
}

interface DocsTableOfContentsProps {
    items: TocItem[];
    title?: string;
}

/**
 * A reusable "On This Page" table of contents component.
 * Displays anchor links to sections within the page.
 */
export function DocsTableOfContents({
    items,
    title = "On This Page"
}: DocsTableOfContentsProps) {
    return (
        <section className="p-4 rounded-lg border bg-card">
            <h2 className="text-lg font-semibold mb-3">{title}</h2>
            <nav className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {items.map((item) => (
                    <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {item.label}
                    </a>
                ))}
            </nav>
        </section>
    );
}
