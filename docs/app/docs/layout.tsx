import { DocsLayout } from "@/components/docs/docs-layout";

export default function DocsRootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DocsLayout>{children}</DocsLayout>;
}
