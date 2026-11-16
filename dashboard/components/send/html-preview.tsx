"use client";

interface HtmlPreviewProps {
    html: string;
    variables?: Record<string, string>;
}

/**
 * Replace template variables in HTML with actual values.
 * Supports: {{var_name}}, {var_name}, $var_name, ${var_name}, ${{var_name}}
 */
function replaceVariables(html: string, variables: Record<string, string>): string {
    let result = html;
    for (const [key, value] of Object.entries(variables)) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // 1. ${{ key }}
        result = result.replace(new RegExp(`\\$\\{\\{\\s*${escapedKey}\\s*\\}\\}`, "g"), value);
        // 2. {{ key }}
        result = result.replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, "g"), value);
        // 3. ${ key }
        result = result.replace(new RegExp(`\\$\\{\\s*${escapedKey}\\s*\\}`, "g"), value);
        // 4. { key } (standalone, not preceded by { or $)
        result = result.replace(new RegExp(`(?<![{$])\\{\\s*${escapedKey}\\s*\\}(?!\\})`, "g"), value);
        // 5. $key (not followed by alphanumeric or underscore)
        result = result.replace(new RegExp(`\\$${escapedKey}(?![a-zA-Z0-9_])`, "g"), value);
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

