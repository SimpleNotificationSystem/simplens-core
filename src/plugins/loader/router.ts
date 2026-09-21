/**
 * Provider Router
 * 
 * Routes notifications to the appropriate provider with automatic fallback.
 */

import { PluginRegistry } from './registry.js';
import type { DeliveryResult, BaseNotification } from '@src/types/types.js';
import { unifiedProcessorLogger as logger } from '@src/processors/unified/unified.logger.js';
import { handleSchemaValidationFailure } from '@src/processors/shared/schema-failure-handler.js';
import { AdminAlertService } from '@src/admin-alerts/admin-alert.service.js';
import { consumeToken } from '@src/processors/shared/rate-limiter.js';

/**
 * Try fallback providers when primary fails with non-retryable error.
 * Cascades through fallback providers in sequence until one succeeds or all fail.
 */
async function tryFallback<T extends BaseNotification>(
    channel: string,
    notification: T,
    primaryError: DeliveryResult['error'],
    currentProviderId?: string
): Promise<DeliveryResult | null> {
    const fallbackIds = PluginRegistry.getFallbackProviderIds(channel);
    if (!fallbackIds || fallbackIds.length === 0) {
        logger.debug(`[ProviderRouter] No fallback providers configured for ${channel}`);
        return null;
    }

    const currentIndex = currentProviderId ? fallbackIds.indexOf(currentProviderId) : -1;
    const candidateIds = currentIndex >= 0 ? fallbackIds.slice(currentIndex + 1) : fallbackIds.filter(id => id !== currentProviderId);
    if (candidateIds.length === 0) {
        logger.debug(`[ProviderRouter] No further fallback providers in cascade after ${currentProviderId}`);
        return null;
    }

    let lastError = primaryError;

    for (let i = 0; i < candidateIds.length; i++) {
        const fallbackId = candidateIds[i];
        const fallbackProvider = PluginRegistry.get(fallbackId);
        if (!fallbackProvider) {
            logger.warn(`[ProviderRouter] Fallback provider '${fallbackId}' not found in registry, continuing cascade`);
            continue;
        }

        // Check rate limiting before attempting to send via fallback
        const rateLimitResult = await consumeToken(fallbackId);
        if (!rateLimitResult.allowed) {
            logger.warn(`[ProviderRouter] Fallback provider '${fallbackId}' is rate limited, continuing cascade`);
            lastError = {
                code: 'FALLBACK_RATE_LIMITED',
                message: `Fallback provider '${fallbackId}' is rate limited`,
                retryable: true
            };
            continue;
        }

        logger.info(`[ProviderRouter] Trying fallback provider [${i + 1}/${candidateIds.length}]: ${fallbackId} (${fallbackProvider.manifest.displayName})`);

        void AdminAlertService.sendAlert('service_health',
            `ℹ️ USING FALLBACK PROVIDER (${i + 1}/${candidateIds.length})\n` +
            `Channel: ${channel}\n` +
            `Notification ID: ${notification.notification_id}\n` +
            `Previous error: ${lastError?.message}\n` +
            `Fallback provider: ${fallbackProvider.manifest.displayName} (${fallbackId})\n` +
            `Action: Check provider configuration if this occurs frequently.`,
            { severity: 'info', notificationId: notification.notification_id, channel });

        const schema = fallbackProvider.getNotificationSchema();
        const validationResult = schema.safeParse(notification);

        if (!validationResult.success) {
            logger.error(`[${channel}] Invalid notification schema for fallback provider '${fallbackId}':`,
                validationResult.error.issues);

            await handleSchemaValidationFailure(
                notification.notification_id,
                channel,
                notification,
                validationResult.error,
                `fallback provider ${fallbackId}`
            );
            lastError = {
                code: 'FALLBACK_SCHEMA_VALIDATION_ERROR',
                message: `Fallback provider ${fallbackId} schema validation failed`,
                retryable: false
            };
            continue;
        }

        try {
            const fallbackResult = await fallbackProvider.send(notification);
            if (fallbackResult.success) {
                logger.success(`[${channel}] Notification delivered via fallback provider: ${fallbackId}`);
                return {
                    ...fallbackResult,
                    messageId: fallbackResult.messageId || `fallback-${fallbackId}`,
                };
            }

            lastError = fallbackResult.error || {
                code: 'FALLBACK_SEND_FAILED',
                message: `Fallback provider ${fallbackId} send failed without error details`,
                retryable: false
            };
        } catch (sendErr) {
            logger.error(`[${channel}] Error sending via fallback provider ${fallbackId}:`, sendErr);
            lastError = {
                code: 'FALLBACK_EXECUTION_ERROR',
                message: sendErr instanceof Error ? sendErr.message : String(sendErr),
                retryable: false
            };
        }
    }

    // All fallbacks failed in cascade
    void AdminAlertService.sendAlert('failed_notification',
        `🔴 ALL PROVIDERS IN CASCADE FAILED\n` +
        `Channel: ${channel}\n` +
        `Notification ID: ${notification.notification_id}\n` +
        `Attempted Fallbacks: ${candidateIds.join(', ')}\n` +
        `Last error: ${lastError?.message}\n` +
        `Action: Verify all provider credentials and connectivity for channel ${channel}.`,
        { severity: 'critical', notificationId: notification.notification_id, channel });

    return {
        success: false,
        error: {
            code: 'ALL_PROVIDERS_FAILED',
            message: `All providers in cascade failed. Last error: ${lastError?.message || 'Unknown'}`,
            retryable: false,
        },
    };
}

/**
 * Get ordered provider cascade for a channel starting from currentProviderId (or default provider).
 */
export function getProviderCascade(
    channel: string,
    currentProviderId?: string
): string[] {
    const defaultId = PluginRegistry.getDefaultProviderId(channel);
    const fallbackIds = PluginRegistry.getFallbackProviderIds(channel) || [];
    const allProviders = defaultId ? [defaultId, ...fallbackIds] : [...fallbackIds];

    if (!currentProviderId) {
        return allProviders;
    }

    const currentIndex = allProviders.indexOf(currentProviderId);
    if (currentIndex >= 0) {
        return allProviders.slice(currentIndex);
    }

    return allProviders;
}

/**
 * Resolve a fallback provider ID for retry exhaustion handoff.
 * Returns undefined when no distinct fallback provider is available.
 */
export function resolveFallbackProviderId(
    channel: string,
    currentProviderId?: string
): string | undefined {
    const fallbackIds = PluginRegistry.getFallbackProviderIds(channel);
    if (!fallbackIds || fallbackIds.length === 0) return undefined;
    if (!currentProviderId) return fallbackIds[0];

    // If currentProviderId is in the cascade, advance to the next fallback provider
    const currentIndex = fallbackIds.indexOf(currentProviderId);
    if (currentIndex >= 0 && currentIndex + 1 < fallbackIds.length) {
        return fallbackIds[currentIndex + 1];
    }

    // If current was primary, return first fallback
    if (currentIndex === -1) {
        return fallbackIds[0];
    }

    return undefined;
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
    const providerId = PluginRegistry.getDefaultProviderId(channel);

    if (!providerId) {
        return { success: false, error: `No provider for channel: ${channel}` };
    }

    return validateNotificationForProvider(providerId, notification);
}

/**
 * Get rate limit config for a provider by ID
 */
export function getRateLimitConfig(providerId: string): { maxTokens: number; refillRate: number; refillInterval?: 'second' | 'minute' | 'hour' | 'day' } | undefined {
    const provider = PluginRegistry.get(providerId);
    return provider?.getRateLimitConfig();
}
