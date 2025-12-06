"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Eye, Code } from "lucide-react";

interface HtmlPreviewProps {
    html: string;
    variables?: Record<string, string>;
}

/**
 * Replace template variables in HTML with actual values.
 */
function replaceVariables(html: string, variables: Record<string, string>): string {
    let result = html;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
        result = result.replace(regex, value);
    }
    return result;
}

export function HtmlPreview({ html, variables = {} }: HtmlPreviewProps) {
    const [mode, setMode] = useState<"preview" | "code">("preview");

    const processedHtml = replaceVariables(html, variables);

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Email Preview</CardTitle>
                    <div className="flex gap-1">
                        <Button
                            variant={mode === "preview" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setMode("preview")}
                        >
                            <Eye className="h-4 w-4 mr-1" />
                            Preview
                        </Button>
                        <Button
                            variant={mode === "code" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setMode("code")}
                        >
                            <Code className="h-4 w-4 mr-1" />
                            HTML
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {mode === "preview" ? (
                    <div className="border rounded-lg bg-white dark:bg-zinc-900 min-h-[200px] max-h-[400px] overflow-auto">
                        <iframe
                            srcDoc={`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <style>
                      body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        padding: 16px;
                        margin: 0;
                        color: #333;
                        background: white;
                      }
                      * { box-sizing: border-box; }
                    </style>
                  </head>
                  <body>${processedHtml}</body>
                </html>
              `}
                            className="w-full min-h-[200px] border-0"
                            sandbox="allow-same-origin"
                            title="Email Preview"
                        />
                    </div>
                ) : (
                    <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[400px] text-sm">
                        <code>{processedHtml}</code>
                    </pre>
                )}
            </CardContent>
        </Card>
    );
}
