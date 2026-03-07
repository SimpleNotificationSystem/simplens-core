/**
 * Provider Router
 * 
 * Routes notifications to the appropriate provider with automatic fallback.
 */

import { PluginRegistry } from './registry.js';
import type { DeliveryResult, BaseNotification } from '../interfaces/provider.types.js';
import { unifiedProcessorLogger as logger } from '@src/processors/unified/unified.logger.js';
import { handleSchemaValidationFailure } from '@src/processors/shared/schema-failure-handler.js';
import { AdminAlertService } from '@src/admin-alerts/admin-alert.service.js';

/**
 * Try fallback provider when primary fails with non-retryable error
 */
async function tryFallback<T extends BaseNotification>(
    channel: string,
    notification: T,
    primaryError: DeliveryResult['error'],
    currentProviderId?: string
): Promise<DeliveryResult | null> {
    const fallbackProviderId = PluginRegistry.getFallbackProviderId(channel);
    if (!fallbackProviderId) {
        logger.debug(`[ProviderRouter] No fallback provider for ${channel}, returning error`);
        return null;
    }

    if (currentProviderId && fallbackProviderId === currentProviderId) {
        logger.debug(`[ProviderRouter] Fallback provider is same as current provider (${currentProviderId}), skipping fallback`);
        return null;
    }

    const fallbackProvider = PluginRegistry.getFallbackProvider(channel);

    if (!fallbackProvider) {
        logger.debug(`[ProviderRouter] No fallback provider for ${channel}, returning error`);
        return null;
    }

    logger.debug(`[ProviderRouter] Primary provider failed, trying fallback: ${fallbackProvider.manifest.name}`);

    void AdminAlertService.sendAlert('service_health',
        `ℹ️ USING FALLBACK PROVIDER\n` +
        `Channel: ${channel}\n` +
        `Notification ID: ${notification.notification_id}\n` +
        `Primary provider error: ${primaryError?.message}\n` +
        `Fallback provider: ${fallbackProvider.manifest.displayName}\n` +
        `Action: Check primary provider configuration if this occurs frequently.`,
        { severity: 'info', notificationId: notification.notification_id, channel });

    const schema = fallbackProvider.getNotificationSchema();
    const validationResult = schema.safeParse(notification);

    if (!validationResult.success) {
        logger.error(`[${channel}] Invalid notification schema for fallback provider of channel:${channel} and provider name ${fallbackProvider.manifest.displayName}:`,
            validationResult.error.issues);

        await handleSchemaValidationFailure(
            notification.notification_id,
            channel,
            notification,
            validationResult.error,
            'fallback provider'
        );
        return {
            success: false,
            error: {
                code: 'FALLBACK_SCHEMA_VALIDATION_ERROR',
                message: 'Fallback provider schema validation failed',
                retryable: false
            }
        };
    }

    const fallbackResult = await fallbackProvider.send(notification);

    if (fallbackResult.success) {
        return fallbackResult;
    }

    // Both failed - return last error
    void AdminAlertService.sendAlert('failed_notification',
        `🔴 ALL PROVIDERS FAILED\n` +
        `Channel: ${channel}\n` +
        `Notification ID: ${notification.notification_id}\n` +
        `Primary provider error: ${primaryError?.message}\n` +
        `Fallback error: ${fallbackResult.error?.message}\n` +
        `Action: Verify provider credentials. Check SMTP/API connectivity. Review simplens.config.yaml.`,
        { severity: 'critical', notificationId: notification.notification_id, channel });

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
 * Resolve a fallback provider ID for retry exhaustion handoff.
 * Returns undefined when no distinct fallback provider is available.
 */
export function resolveFallbackProviderId(
    channel: string,
    currentProviderId?: string
): string | undefined {
    const fallbackProviderId = PluginRegistry.getFallbackProviderId(channel);

    if (!fallbackProviderId || fallbackProviderId === currentProviderId) {
        return undefined;
    }

    return fallbackProviderId;
}

/**
 * Send notification with automatic fallback
 * 
 * 1. Try explicit/default provider for channel
 * 2. If fails with non-retryable error, try fallback
 * 3. Return result (success or final failure)
 */
export async function sendWithFallback<T extends BaseNotification>(
    channel: string,
    notification: T
): Promise<DeliveryResult> {
    // 0. Use explicit provider if specified
    if (notification.provider) {
        logger.debug(`[ProviderRouter] Using explicit provider: ${notification.provider}`);
        const result = await sendToProvider(notification.provider, notification);

        // If success or retryable error, return as-is
        if (result.success || result.error?.retryable) {
            return result;
        }

        // Non-retryable failure - try fallback provider
        const fallbackResult = await tryFallback(channel, notification, result.error, notification.provider);
        return fallbackResult ?? result;
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

    const defaultProviderId = PluginRegistry.getDefaultProviderId(channel);

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
    const fallbackResult = await tryFallback(
        channel,
        notification,
        result.error,
        defaultProviderId
    );
    return fallbackResult ?? result;
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
 * Validate notification against a specific provider schema
 */
export function validateNotificationForProvider<T extends BaseNotification>(
    providerId: string,
    notification: unknown
): { success: true; data: T } | { success: false; error: string } {
    const provider = PluginRegistry.get(providerId);

    if (!provider) {
        return { success: false, error: `Provider '${providerId}' not found` };
    }

    const schema = provider.getNotificationSchema();
    const result = schema.safeParse(notification);

    if (result.success) {
        return { success: true, data: result.data as T };
    }

    return {
        success: false,
        error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '),
    };
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
 * Get rate limit config for a provider by ID
 */
export function getRateLimitConfig(providerId: string): { maxTokens: number; refillRate: number; refillInterval?: 'second' | 'minute' | 'hour' | 'day' } | undefined {
    const provider = PluginRegistry.get(providerId);
    return provider?.getRateLimitConfig();
}
