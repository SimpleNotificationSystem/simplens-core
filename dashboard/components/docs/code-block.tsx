"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CodeBlockProps {
    children: string;
    language?: string;
    filename?: string;
    showLineNumbers?: boolean;
    className?: string;
}

export function CodeBlock({
    children,
    language = "bash",
    filename,
    showLineNumbers = false,
    className,
}: CodeBlockProps) {
    const [copied, setCopied] = useState(false);

    const copyToClipboard = async () => {
        await navigator.clipboard.writeText(children);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const lines = children.split("\n");

    return (
        <div className={cn("relative group rounded-lg overflow-hidden", className)}>
            {filename && (
                <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b text-sm text-muted-foreground">
                    <span className="font-mono">{filename}</span>
                    <span className="text-xs uppercase">{language}</span>
                </div>
            )}
            <div className="relative">
                <pre className={cn(
                    "overflow-x-auto p-4 text-sm bg-zinc-950 dark:bg-zinc-900 text-zinc-100",
                    !filename && "rounded-lg"
                )}>
                    <code className={`language-${language}`}>
                        {showLineNumbers ? (
                            lines.map((line, index) => (
                                <div key={index} className="table-row">
                                    <span className="table-cell pr-4 text-right text-zinc-500 select-none">
                                        {index + 1}
                                    </span>
                                    <span className="table-cell">{line}</span>
                                </div>
                            ))
                        ) : (
                            children
                        )}
                    </code>
                </pre>
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                    onClick={copyToClipboard}
                >
                    {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                    ) : (
                        <Copy className="h-4 w-4" />
                    )}
                    <span className="sr-only">Copy code</span>
                </Button>
            </div>
        </div>
    );
}

interface InlineCodeProps {
    children: React.ReactNode;
}

export function InlineCode({ children }: InlineCodeProps) {
    return (
        <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">
            {children}
        </code>
    );
}
