import { z } from "zod";
import mongoose from "mongoose";
import {
    CHANNEL,
    NOTIFICATION_STATUS,
    OUTBOX_STATUS,
    DELAYED_TOPICS,
    NOTIFICATION_STATUS_SF,
    OUTBOX_TOPICS
} from "./types.js";
import type { UUID } from "crypto";
import {validate, version} from 'uuid';
import { env } from "@src/config/env.config.js";

const objectIdSchema = z.custom<mongoose.Types.ObjectId>(
    (val) => mongoose.Types.ObjectId.isValid(val as string),
    { error: "Invalid ObjectId" }
);

const UUIDV4Schema = z.custom<UUID>(
    (val)=> validate(val)&&(version(val as string)==4),
    {error: "Invalid UUIDV4"}
)

const variablesSchema = z.record(z.string(), z.string());

export const emailNotificationSchema = z.object({
    notification_id: objectIdSchema,
    request_id: UUIDV4Schema,
    client_id: UUIDV4Schema,
    channel: z.literal(CHANNEL.email),
    recipient: z.object({
        user_id: z.string(),
        email: z.email(),
    }),
    content: z.object({
        subject: z.string().optional(),
        message: z.string(),
    }),
    variables: variablesSchema.optional(),
    webhook_url: z.url(),
    retry_count: z.number().int().min(0),
    created_at: z.coerce.date(),
});

export const whatsappNotificationSchema = z.object({
    notification_id: objectIdSchema,
    request_id: UUIDV4Schema,
    client_id: UUIDV4Schema,
    channel: z.literal(CHANNEL.whatsapp),
    recipient: z.object({
        user_id: z.string(),
        phone: z.string(),
    }),
    content: z.object({
        message: z.string(),
    }),
    variables: variablesSchema.optional(),
    webhook_url: z.url(),
    retry_count: z.number().int().min(0),
    created_at: z.coerce.date(),
});

export const delayedNotificationTopicSchema = z.object({
    notification_id: objectIdSchema,
    request_id: UUIDV4Schema,
    client_id: UUIDV4Schema,
    scheduled_at: z.coerce.date(),
    target_topic: z.enum(DELAYED_TOPICS),
    payload: z.union([emailNotificationSchema, whatsappNotificationSchema]),
    created_at: z.coerce.date(),
});

export const notificationStatusTopicSchema = z.object({
    notification_id: objectIdSchema,
    request_id: UUIDV4Schema,
    client_id: UUIDV4Schema,
    channel: z.enum(CHANNEL),
    status: z.enum(NOTIFICATION_STATUS_SF),
    message: z.string(),
    retry_count: z.number().int().min(0),
    webhook_url: z.url(),
    created_at: z.coerce.date(),
});

export const notificationSchema = z.object({
    request_id: UUIDV4Schema,
    client_id: UUIDV4Schema,
    client_name: z.string().optional(),
    channel: z.enum(CHANNEL),
    recipient: z.object({
        user_id: z.string(),
        email: z.email().optional(),
        phone: z.string().optional(),
    }),
    content: z.object({
        email: z.object({
            subject: z.string().optional(),
            message: z.string(),
        }).optional(),
        whatsapp: z.object({
            message: z.string(),
        }).optional(),
    }),
    variables: variablesSchema.optional(),
    webhook_url: z.url(),
    status: z.enum(NOTIFICATION_STATUS),
    scheduled_at: z.coerce.date().optional(),
    error_message: z.string().optional(),
    retry_count: z.number().int().min(0),
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

export const outboxSchema = z.object({
    notification_id: objectIdSchema,
    topic: z.enum(OUTBOX_TOPICS),
    payload: z.union([emailNotificationSchema, whatsappNotificationSchema, delayedNotificationTopicSchema]),
    status: z.enum(OUTBOX_STATUS),
    // Worker synchronization fields
    claimed_by: z.string().nullable().optional(),
    claimed_at: z.coerce.date().nullable().optional(),
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

export const notificationRequestSchema = z.object({
    request_id: UUIDV4Schema,
    client_id: UUIDV4Schema,
    client_name: z.string().optional(),
    channel: z.array(z.enum(CHANNEL)),
    recipient: z.object({
        user_id: z.string(),
        email: z.email().optional(),
        phone: z.string().optional(),
    }),
    content: z.object({
        email: z.object({
            message: z.string(),
            subject: z.string().optional(),
        }).optional(),
        whatsapp: z.object({
            message: z.string()
        }).optional()
    }),
    scheduled_at: z.coerce.date().optional(),
    webhook_url: z.url()
}).refine(
    (data)=>{
        if (data.channel.includes(CHANNEL.email)) {
            return data.content.email !== undefined && data.content.email.message.length > 0;
        }
        return true;
    },
    { error: "Email content is required when email channel is specified", path: ["content.email"] }
).refine(
    (data) => {
        if (data.channel.includes(CHANNEL.email)) {
            return data.recipient.email !== undefined;
        }
        return true;
    },
    { message: "Recipient email is required when email channel is specified", path: ["recipient.email"] }
).refine(
    (data) => {
        if (data.channel.includes(CHANNEL.whatsapp)) {
            return data.content.whatsapp !== undefined && data.content.whatsapp.message.length > 0;
        }
        return true;
    },
    { message: "WhatsApp content is required when whatsapp channel is specified", path: ["content.whatsapp"] }
).refine(
    (data) => {
        if (data.channel.includes(CHANNEL.whatsapp)) {
            return data.recipient.phone !== undefined;
        }
        return true;
    },
    { message: "Recipient phone is required when whatsapp channel is specified", path: ["recipient.phone"] }
);

export const batchNotificationRequestSchema = z.object({
    client_id: UUIDV4Schema,
    client_name: z.string().optional(),
    channel: z.array(z.enum(CHANNEL)),
    content: z.object({
        email: z.object({
            message: z.string(),
            subject: z.string().optional(),
        }).optional(),
        whatsapp: z.object({
            message: z.string()
        }).optional()
    }),
    recipients: z.array(
        z.object({
            request_id: UUIDV4Schema,
            user_id: z.string(),
            email: z.email().optional(),
            phone: z.string().optional(),
            variables: variablesSchema.optional(),
        }),
    ),
    scheduled_at: z.coerce.date().optional(),
    webhook_url: z.url()
}).refine(
    (data) => {
        if (data.channel.includes(CHANNEL.email)) {
            return data.content.email !== undefined && data.content.email.message.length > 0;
        }
        return true;
    },
    { message: "Email content is required when email channel is specified", path: ["content.email"] }
).refine(
    (data) => {
        if (data.channel.includes(CHANNEL.email)) {
            return data.recipients.every(r => r.email !== undefined);
        }
        return true;
    },
    { message: "All recipients must have email when email channel is specified", path: ["recipients"] }
).refine(
    (data) => {
        if (data.channel.includes(CHANNEL.whatsapp)) {
            return data.content.whatsapp !== undefined && data.content.whatsapp.message.length > 0;
        }
        return true;
    },
    { message: "WhatsApp content is required when whatsapp channel is specified", path: ["content.whatsapp"] }
).refine(
    (data) => {
        if (data.channel.includes(CHANNEL.whatsapp)) {
            return data.recipients.every(r => r.phone !== undefined);
        }
        return true;
    },
    { message: "All recipients must have phone when whatsapp channel is specified", path: ["recipients"] }
).refine(
    (data)=>{
        if(data.recipients && data.recipients.length*data.channel.length<=env.MAX_BATCH_REQ_LIMIT){
            return true;
        }
    },
    {
        error: `Batch size exceeds limit (${env.MAX_BATCH_REQ_LIMIT})`, path: ["recipients"]
    }
);

export const validateEmailNotification = (data: unknown) => emailNotificationSchema.parse(data);
export const validateWhatsappNotification = (data: unknown) => whatsappNotificationSchema.parse(data);
export const validateDelayedNotificationTopic = (data: unknown) => delayedNotificationTopicSchema.parse(data);
export const validateNotificationStatusTopic = (data: unknown) => notificationStatusTopicSchema.parse(data);
export const validateNotification = (data: unknown) => notificationSchema.parse(data);
export const validateOutbox = (data: unknown) => outboxSchema.parse(data);
export const validateNotificationRequest = (data: unknown) => notificationRequestSchema.parse(data);
export const validateBatchNotificationRequest = (data: unknown)=>batchNotificationRequestSchema.parse(data);

export const safeValidateEmailNotification = (data: unknown) => emailNotificationSchema.safeParse(data);
export const safeValidateWhatsappNotification = (data: unknown) => whatsappNotificationSchema.safeParse(data);
export const safeValidateDelayedNotificationTopic = (data: unknown) => delayedNotificationTopicSchema.safeParse(data);
export const safeValidateNotificationStatusTopic = (data: unknown) => notificationStatusTopicSchema.safeParse(data);
export const safeValidateNotification = (data: unknown) => notificationSchema.safeParse(data);
export const safeValidateOutbox = (data: unknown) => outboxSchema.safeParse(data);
export const safeValidateNotificationRequest = (data: unknown) => notificationRequestSchema.safeParse(data);
export const safeValidateBatchNotificationRequest = (data: unknown)=>batchNotificationRequestSchema.safeParse(data);
