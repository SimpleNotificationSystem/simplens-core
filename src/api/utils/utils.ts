/**
 * API Utilities
 * 
 * Helper functions for notification processing.
 * These are channel-agnostic - specific logic is handled by plugins.
 */

import { notification_request, outbox, notification, batch_notification_request, getTopicForChannel, CORE_TOPICS, delayed_notification_topic } from "@src/types/types.js"
import { NOTIFICATION_STATUS, OUTBOX_STATUS } from "@src/types/types.js"
import mongoose from "mongoose";
import notification_model from "@src/database/models/notification.models.js";
import outbox_model from "@src/database/models/outbox.models.js";
import { apiLogger as logger } from "@src/workers/utils/logger.js";

/**
 * Convert notification request to notification schema objects
 */
export const convert_notification_request_to_notification_schema = (data: notification_request): notification[] => {
    const notifications: notification[] = [];

    data.channel.forEach((channel, index) => {
        let provider: string | undefined;
        if (Array.isArray(data.provider)) {
            const p = data.provider[index];
            provider = p ?? undefined;
        } else {
            provider = data.provider;
        }

        const base_notification: notification = {
            request_id: data.request_id,
            client_id: data.client_id,
            client_name: data.client_name,
            channel: channel,
            provider: provider,
            recipient: data.recipient,
            content: data.content,
            variables: data.variables,
            webhook_url: data.webhook_url,
            status: NOTIFICATION_STATUS.pending,
            scheduled_at: data.scheduled_at,
            retry_count: 0,
            created_at: new Date()
        };

        notifications.push(base_notification);
    });

    return notifications;
}

/**
 * Convert batch notification to notification schema objects
 */
export const convert_batch_notification_schema_to_notification_schema = (data: batch_notification_request): notification[] => {
    const notifications: notification[] = [];

    for (const recipient of data.recipients) {
        data.channel.forEach((channel, index) => {
            let provider: string | undefined;
            if (Array.isArray(data.provider)) {
                const p = data.provider[index];
                provider = p ?? undefined;
            } else {
                provider = data.provider;
            }

            const notification_obj: notification = {
                request_id: recipient.request_id,
                client_id: data.client_id,
                client_name: data.client_name,
                channel,
                provider: provider,
                recipient: {
                    ...recipient // Include any channel-specific fields
                },
                content: data.content,
                variables: recipient.variables,
                webhook_url: data.webhook_url,
                status: NOTIFICATION_STATUS.pending,
                scheduled_at: data.scheduled_at,
                retry_count: 0,
                created_at: new Date(),
            };
            notifications.push(notification_obj);
        });
    }

    return notifications;
}

/**
 * Create outbox entry for a notification
 */
export const to_outbox = (data: notification, notification_id: mongoose.Types.ObjectId): outbox => {
    // Determine topic based on scheduling
    const isScheduled = data.scheduled_at && new Date(data.scheduled_at) > new Date();
    const topic = isScheduled
        ? CORE_TOPICS.delayed_notification
        : getTopicForChannel(data.channel);

    // Build payload
    const payload = isScheduled
        ? to_delayed_notification_topic(data, notification_id)
        : to_channel_notification(data, notification_id);

    return {
        notification_id,
        topic,
        payload,
        status: OUTBOX_STATUS.pending,
        created_at: new Date(),
        updated_at: new Date()
    };
}

/**
 * Convert notification to channel-specific format
 * Extracts channel-specific content if present (e.g., content.email for email channel)
 */
export const to_channel_notification = (data: notification, notification_id: mongoose.Types.ObjectId): Record<string, unknown> => {
    // Extract channel-specific content if available
    // Dashboard sends: content: { email: { subject, message } }
    // Plugin expects: content: { subject, message }
    const rawContent = data.content as Record<string, unknown>;
    const channelContent = rawContent[data.channel] as Record<string, unknown> | undefined;
    const finalContent = channelContent || rawContent;

    return {
        notification_id,
        request_id: data.request_id,
        client_id: data.client_id,
        channel: data.channel,
        provider: data.provider,
        recipient: data.recipient,
        content: finalContent,
        variables: data.variables,
        webhook_url: data.webhook_url,
        retry_count: data.retry_count ?? 0,
        created_at: new Date(),
    };
}

/**
 * Convert notification to delayed notification format
 */
export const to_delayed_notification_topic = (data: notification, notification_id: mongoose.Types.ObjectId): delayed_notification_topic => {
    const payload = to_channel_notification(data, notification_id);

    return {
        notification_id,
        request_id: data.request_id,
        client_id: data.client_id,
        scheduled_at: data.scheduled_at as Date,
        target_topic: getTopicForChannel(data.channel),
        payload,
        created_at: new Date(),
    };
}

/**
 * Error class for duplicate notifications
 */
export class DuplicateNotificationError extends Error {
    public duplicateCount: number;
    public duplicateKeys: { request_id: string; channel: string }[];

    constructor(message: string, duplicateKeys: { request_id: string; channel: string }[] = []) {
        super(message);
        this.name = 'DuplicateNotificationError';
        this.duplicateCount = duplicateKeys.length;
        this.duplicateKeys = duplicateKeys;
    }
}

/**
 * Process notifications and create outbox entries
 */
export const process_notifications = async (notifications: notification[]) => {
    const notification_ids: mongoose.Types.ObjectId[] = [];
    const outbox_entries: outbox[] = [];
    const duplicate_keys: { request_id: string; channel: string }[] = [];

    for (const notification of notifications) {
        // Check for duplicates
        const existingNotification = await notification_model.findOne({
            request_id: notification.request_id,
            channel: notification.channel
        });

        if (existingNotification) {
            duplicate_keys.push({
                request_id: notification.request_id as string,
                channel: notification.channel
            });
            continue;
        }

        // Create notification document
        const notification_doc = new notification_model(notification);
        await notification_doc.save();

        const notification_id = notification_doc._id as mongoose.Types.ObjectId;
        notification_ids.push(notification_id);

        // Create outbox entry
        const outbox_entry = to_outbox(notification, notification_id);
        outbox_entries.push(outbox_entry);
    }

    // Insert outbox entries in bulk
    if (outbox_entries.length > 0) {
        await outbox_model.insertMany(outbox_entries);
    }

    // Handle duplicates
    if (duplicate_keys.length > 0) {
        if (duplicate_keys.length === notifications.length) {
            throw new DuplicateNotificationError(
                'All notifications are duplicates',
                duplicate_keys
            );
        }
        logger.warn(`Skipped ${duplicate_keys.length} duplicate notifications`);
    }

    return {
        notification_ids,
        created_count: notification_ids.length,
        duplicate_count: duplicate_keys.length,
        duplicate_keys: duplicate_keys.length > 0 ? duplicate_keys : undefined
    };
}