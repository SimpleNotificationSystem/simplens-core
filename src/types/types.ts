import { emailNotificationSchema, whatsappNotificationSchema, delayedNotificationTopicSchema, notificationStatusTopicSchema, notificationSchema, outboxSchema, notificationRequestSchema, batchNotificationRequestSchema } from "./schemas.js";
import { z } from 'zod';

export enum CHANNEL {
    email = "email",
    whatsapp = "whatsapp"
}

export enum TOPICS {
    email_notification = "email_notification",
    whatsapp_notification = "whatsapp_notification",
    delayed_notification = "delayed_notification",
    notification_status = "notification_status"
}

export enum DELAYED_TOPICS {
    email_notification = "email_notification",
    whatsapp_notification = "whatsapp_notification"
}

export enum OUTBOX_TOPICS {
    email_notification = "email_notification",
    whatsapp_notification = "whatsapp_notification",
    delayed_notification = "delayed_notification"
}

export enum NOTIFICATION_STATUS {
    delivered = "delivered",
    pending = "pending",
    processing = "processing",
    failed = "failed"
}

export enum NOTIFICATION_STATUS_SF {
    delivered = "delivered",
    failed = "failed"
}

export enum OUTBOX_STATUS {
    pending = "pending",
    processing = "processing",
    published = "published"
}



export type email_notification = z.infer<typeof emailNotificationSchema>;

export type whatsapp_notification = z.infer<typeof whatsappNotificationSchema>;

export type delayed_notification_topic = z.infer<typeof delayedNotificationTopicSchema>;

export type notification_status_topic = z.infer<typeof notificationStatusTopicSchema>;

export type notification = z.infer<typeof notificationSchema>;

export type outbox = z.infer<typeof outboxSchema>;

export type notification_request = z.infer<typeof notificationRequestSchema>;

export type batch_notification_request = z.infer<typeof batchNotificationRequestSchema>;

