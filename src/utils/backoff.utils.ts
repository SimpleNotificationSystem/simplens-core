/**
 * Backoff calculation utilities
 */

/**
 * Calculate exponential backoff delay in milliseconds
 * Formula: Math.min(baseDelayMs * Math.pow(2, retryCount), maxDelayMs)
 * 
 * @param retryCount - Current retry attempt count (>= 0)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000ms)
 * @param maxDelayMs - Maximum delay cap in milliseconds (default: 300000ms / 5 minutes)
 * @returns Delay in milliseconds
 */
export function calculateExponentialBackoff(
    retryCount: number,
    baseDelayMs = 1000,
    maxDelayMs = 300000
): number {
    const safeRetryCount = Math.max(0, retryCount);
    const delay = baseDelayMs * Math.pow(2, safeRetryCount);
    return Math.min(delay, maxDelayMs);
}
