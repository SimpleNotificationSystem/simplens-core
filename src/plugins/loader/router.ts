/**
 * Provider Router
 * 
 * Routes notifications to the appropriate provider with automatic fallback.
 */

import { PluginRegistry } from './registry.js';
import type { SimpleNSProvider, DeliveryResult, BaseNotification } from '../interfaces/provider.types.js';

/**
 * Send notification with automatic fallback
 * 
 * 1. Try default provider for channel
 * 2. If fails with non-retryable error, try fallback
 * 3. Return result (success or final failure)
 */
export async function sendWithFallback<T extends BaseNotification>(
    channel: string,
    notification: T
): Promise<DeliveryResult> {
    // 0. Use explicit provider if specified
    if (notification.provider) {
        console.log(`[ProviderRouter] Using explicit provider: ${notification.provider}`);
        return sendToProvider(notification.provider, notification);
    }

    const defaultProvider = PluginRegistry.getDefaultProvider(channel);

    if (!defaultProvider) {
        return {
            success: false,
            error: {
                code: 'NO_PROVIDER',
                message: `No provider configured for channel: ${channel}`,
                retryable: false,
            },
        };
    }

    // Try default provider
    const result = await defaultProvider.send(notification);

    if (result.success) {
        return result;
    }

    // If error is retryable, don't fallback - let SimpleNS retry with same provider
    if (result.error?.retryable) {
        return result;
    }

    // Try fallback provider
    const fallbackProvider = PluginRegistry.getFallbackProvider(channel);

    if (!fallbackProvider) {
        console.log(`[ProviderRouter] No fallback provider for ${channel}, returning error`);
        return result;
    }

    console.log(`[ProviderRouter] Default provider failed, trying fallback: ${fallbackProvider.manifest.name}`);

    const fallbackResult = await fallbackProvider.send(notification);

    if (fallbackResult.success) {
        return fallbackResult;
    }

    // Both failed - return last error
    return {
        success: false,
        error: {
            code: 'ALL_PROVIDERS_FAILED',
            message: `All providers failed. Last error: ${fallbackResult.error?.message || 'Unknown'}`,
            retryable: false,
        },
    };
}

/**
 * Send notification to a specific provider by ID
 */
export async function sendToProvider<T extends BaseNotification>(
    providerId: string,
    notification: T
): Promise<DeliveryResult> {
    const provider = PluginRegistry.get(providerId);

    if (!provider) {
        return {
            success: false,
            error: {
                code: 'PROVIDER_NOT_FOUND',
                message: `Provider '${providerId}' not found`,
                retryable: false,
            },
        };
    }

    return provider.send(notification);
}

/**
 * Validate notification against provider schema
 */
export function validateNotification(
    channel: string,
    notification: unknown
): { success: true; data: unknown } | { success: false; error: string } {
    const provider = PluginRegistry.getDefaultProvider(channel);

    if (!provider) {
        return { success: false, error: `No provider for channel: ${channel}` };
    }

    const schema = provider.getNotificationSchema();
    const result = schema.safeParse(notification);

    if (result.success) {
        return { success: true, data: result.data };
    }

    return {
        success: false,
        error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '),
    };
}

/**
 * Get rate limit config for a channel from its provider
 */
export function getRateLimitConfig(channel: string): { maxTokens: number; refillRate: number } | undefined {
    const provider = PluginRegistry.getDefaultProvider(channel);
    return provider?.getRateLimitConfig();
}
