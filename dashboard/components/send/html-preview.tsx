"use client";

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
    const processedHtml = replaceVariables(html, variables);

    return (
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
    );
}

