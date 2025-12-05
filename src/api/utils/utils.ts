import { notification_request, outbox, email_notification, whatsapp_notification, delayed_notification_topic, batch_notification_request } from "@src/types/types.js"
import { notification } from "@src/types/types.js"
import { CHANNEL, NOTIFICATION_STATUS, OUTBOX_TOPICS, OUTBOX_STATUS, DELAYED_TOPICS } from "@src/types/types.js"
import mongoose from "mongoose";
import notification_model from "@src/database/models/notification.models.js";
import outbox_model from "@src/database/models/outbox.models.js";
import { apiLogger as logger } from "@src/workers/utils/logger.js";

export const convert_notification_request_to_notification_schema = (data: notification_request): notification[] => {
    const notifications: notification[] = [];
    for (const channel of data.channel) {
        const base_notification = {
            request_id: data.request_id,
            client_id: data.client_id,
            client_name: data.client_name,
            channel: channel,
            recipient: {
                user_id: data.recipient.user_id,
                email: channel === CHANNEL.email ? data.recipient.email : undefined,
                phone: channel === CHANNEL.whatsapp ? data.recipient.phone : undefined,
            },
            content: {
                email: channel === CHANNEL.email ? data.content.email : undefined,
                whatsapp: channel === CHANNEL.whatsapp ? data.content.whatsapp : undefined,
            },
            webhook_url: data.webhook_url,
            status: NOTIFICATION_STATUS.pending,
            scheduled_at: data.scheduled_at,
            retry_count: 0,
            created_at: new Date()
        } satisfies notification;

        notifications.push(base_notification);
    }

    return notifications;
}

export const convert_batch_notification_schema_to_notification_schema = (data: batch_notification_request): notification[] => {
    const notifications: notification[] = [];

    for (const recipient of data.recipients) {
        for (const channel of data.channel) {
            const notification_obj = {
                request_id: recipient.request_id,
                client_id: data.client_id,
                client_name: data.client_name,
                channel,
                recipient: {
                    user_id: recipient.user_id,
                    email: channel === CHANNEL.email ? recipient.email : undefined,
                    phone: channel === CHANNEL.whatsapp ? recipient.phone : undefined,
                },
                content: {
                    email: channel === CHANNEL.email ? data.content.email : undefined,
                    whatsapp: channel === CHANNEL.whatsapp ? data.content.whatsapp : undefined,
                },
                variables: recipient.variables,
                webhook_url: data.webhook_url,
                status: NOTIFICATION_STATUS.pending,
                scheduled_at: data.scheduled_at,
                retry_count: 0,
                created_at: new Date(),
            } satisfies notification;

            notifications.push(notification_obj);
        }
    }

    return notifications;
};

export const convert_notification_schema_to_outbox_schema = (data: notification, notification_id: mongoose.Types.ObjectId): outbox=>{
    if (data.scheduled_at && data.scheduled_at.getTime() > Date.now()) {
        const payload = to_delayed_notification_topic(data, notification_id);
        return {
            notification_id,
            topic: OUTBOX_TOPICS.delayed_notification,
            payload,
            status: OUTBOX_STATUS.pending,
            created_at: new Date(),
            updated_at: new Date()
        };
    }
    if (data.channel === CHANNEL.email) {
        const payload = to_email_notification(data, notification_id);
        return {
            notification_id,
            topic: OUTBOX_TOPICS.email_notification,
            payload,
            status: OUTBOX_STATUS.pending,
            created_at: new Date(),
            updated_at: new Date()
        };
    }
    const payload = to_whatsapp_notification(data, notification_id);
    return {
        notification_id,
        topic: OUTBOX_TOPICS.whatsapp_notification,
        payload,
        status: OUTBOX_STATUS.pending,
        created_at: new Date(),
        updated_at: new Date()
    };
}

export const to_email_notification = (data: notification, notification_id: mongoose.Types.ObjectId): email_notification => {
    return {
        notification_id,
        request_id: data.request_id,
        client_id: data.client_id,
        channel: CHANNEL.email,
        recipient: {
            user_id: data.recipient.user_id,
            email: data.recipient.email as string,
        },
        content: {
            subject: data.content.email?.subject,
            message: data.content.email?.message as string,
        },
        variables: data.variables,
        webhook_url: data.webhook_url,
        retry_count: data.retry_count ?? 0,
        created_at: new Date(),
    };
}

export const to_whatsapp_notification = (data: notification, notification_id: mongoose.Types.ObjectId): whatsapp_notification => {
    return {
        notification_id,
        request_id: data.request_id,
        client_id: data.client_id,
        channel: CHANNEL.whatsapp,
        recipient: {
            user_id: data.recipient.user_id,
            phone: data.recipient.phone as string,
        },
        content: {
            message: data.content.whatsapp?.message as string,
        },
        variables: data.variables,
        webhook_url: data.webhook_url,
        retry_count: data.retry_count ?? 0,
        created_at: new Date(),
    };
}

export const to_delayed_notification_topic = (data: notification, notification_id: mongoose.Types.ObjectId): delayed_notification_topic => {
    const target_topic: DELAYED_TOPICS = data.channel === CHANNEL.email
        ? DELAYED_TOPICS.email_notification
        : DELAYED_TOPICS.whatsapp_notification;

    const payload = data.channel === CHANNEL.email
        ? to_email_notification(data, notification_id)
        : to_whatsapp_notification(data, notification_id);

    return {
        notification_id,
        request_id: data.request_id,
        client_id: data.client_id,
        scheduled_at: data.scheduled_at as Date,
        target_topic,
        payload,
        created_at: new Date(),
    };
}

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

export const process_notifications = async (notifications: notification[])=>{
    const session = await mongoose.startSession();
    try{
        await session.withTransaction(async()=>{
            const created_notifications = await notification_model.insertMany(notifications, {session, ordered: false});
            const outboxes = created_notifications.map((created)=>{
                return convert_notification_schema_to_outbox_schema(created as notification, created._id as mongoose.Types.ObjectId);
            });
            await outbox_model.insertMany(outboxes, {session, ordered: true});
        });
        logger.info("Successfully added notifications to MongoDB");
    } catch(err: any) {
        if (err.code === 11000 || err.name === 'MongoBulkWriteError') {
            logger.warn("Duplicate notification(s) detected:", { error: err.message });
            
            // Extract duplicate key info from the error if available
            const duplicateKeys: { request_id: string; channel: string }[] = [];
            if (err.writeErrors) {
                for (const writeErr of err.writeErrors) {
                    if (writeErr.err?.code === 11000 && writeErr.err?.op) {
                        duplicateKeys.push({
                            request_id: writeErr.err.op.request_id,
                            channel: writeErr.err.op.channel
                        });
                    }
                }
            }
            
            throw new DuplicateNotificationError(
                "Duplicate notification(s) already exist with non-failed status",
                duplicateKeys
            );
        }
        logger.error("Transaction failed:", err);
        throw new Error("Failed to create notifications");
    } finally {
        await session.endSession();
    }
}