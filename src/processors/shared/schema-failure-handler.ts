/**
 * Schema Validation Failure Handler
 * 
 * Provides a centralized handler for schema validation failures
 * to avoid code duplication and ensure consistent behavior.
 */

import type { ZodError } from 'zod';
import { setFailed } from './idempotency.js';
import { publishStatus } from './status.producer.js';
import { NOTIFICATION_STATUS_SF } from '@src/types/types.js';
import { unifiedProcessorLogger as logger } from '../unified/unified.logger.js';
import { AdminAlertService } from '@src/admin-alerts/admin-alert.service.js';

/**
 * Format Zod validation errors into a readable message
 */
const formatValidationErrors = (error: ZodError): string => {
    return error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
};

/**
 * Handle schema validation failure by marking as failed in Redis 
 * and publishing failure status to Kafka
 * 
 * @param notificationId - The notification ID to mark as failed
 * @param channel - The channel name (for logging and status)
 * @param rawData - The raw notification data (for extracting metadata)
 * @param validationError - The Zod validation error
 * @param context - Additional context for logging (e.g., 'default provider', 'fallback provider')
 */
export async function handleSchemaValidationFailure(
    notificationId: string,
    channel: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawData: any,
    validationError: ZodError,
    context: string = 'provider'
): Promise<void> {
    try {
        // Mark as failed in Redis to prevent recovery service from flagging as orphaned
        await setFailed(notificationId, rawData.retry_count as number || 0);

        void AdminAlertService.sendAlert('failed_notification',
            `📋 SCHEMA VALIDATION FAILED\n` +
            `Notification ID: ${notificationId}\n` +
            `Channel: ${channel}\n` +
            `Context: ${context}\n` +
            `Validation errors: ${formatValidationErrors(validationError)}\n` +
            `Action: Check notification payload format. Verify required fields match provider schema.`,
            { severity: 'warning', notificationId, channel });

        // Publish failure status if we have enough data
        if (rawData.request_id && rawData.client_id) {
            const failureStatus = {
                notification_id: notificationId,
                request_id: rawData.request_id,
                client_id: rawData.client_id,
                channel: channel,
                status: NOTIFICATION_STATUS_SF.failed,
                message: `Schema validation failed for ${context}: ${formatValidationErrors(validationError)}`,
                retry_count: rawData.retry_count || 0,
                webhook_url: rawData.webhook_url,
                created_at: new Date()
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await publishStatus(failureStatus as any);
            logger.warn(`[${channel}] Marked notification ${notificationId} as failed due to schema validation failure`);
        }
    } catch (err) {
        // Log but don't throw - we still want to handle the validation failure
        logger.error(`[${channel}] Failed to mark notification ${notificationId} as failed:`, err);
    }
}
