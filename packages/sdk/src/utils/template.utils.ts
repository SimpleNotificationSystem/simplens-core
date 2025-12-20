/**
 * simplens-sdk - Template Utilities
 * 
 * Helper functions for plugin developers
 */

/**
 * Replace template variables in a string
 * Supports {{variable_name}} syntax with optional whitespace
 * 
 * @param template - String with {{variable}} placeholders
 * @param variables - Key-value pairs for substitution
 * @returns String with variables replaced
 * 
 * @example
 * replaceVariables('Hello {{name}}!', { name: 'World' })
 * // Returns: 'Hello World!'
 */
export function replaceVariables(
    template: string,
    variables: Record<string, string>
): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
        // Match {{key}} with optional whitespace inside braces
        const pattern = new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, 'g');
        result = result.replace(pattern, value);
    }

    return result;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if content contains HTML tags
 * 
 * @param content - String to check
 * @returns true if content appears to be HTML
 */
export function isHtmlContent(content: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(content);
}

/**
 * Truncate a string to a maximum length
 * 
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add if truncated (default: '...')
 * @returns Truncated string
 */
export function truncate(
    str: string,
    maxLength: number,
    suffix: string = '...'
): string {
    if (str.length <= maxLength) {
        return str;
    }
    return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Sleep for a specified duration
 * Useful for implementing backoff delays
 * 
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries
 * @param baseDelayMs - Base delay in milliseconds (doubles each retry)
 * @returns Result of successful function call
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                await sleep(delay);
            }
        }
    }

    throw lastError;
}
