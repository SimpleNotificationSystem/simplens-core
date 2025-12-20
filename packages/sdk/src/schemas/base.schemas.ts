/**
 * simplens-sdk - Base Schemas
 * 
 * Reusable Zod schemas that plugin developers can extend
 */

import { z } from 'zod';

/**
 * Base recipient schema - all providers extend this
 */
export const baseRecipientSchema = z.object({
    user_id: z.string(),
});

/**
 * Base notification schema - common fields for all notifications
 */
export const baseNotificationSchema = z.object({
    notification_id: z.string(),
    request_id: z.string().uuid(),
    client_id: z.string().uuid(),
    channel: z.string(),
    variables: z.record(z.string(), z.string()).optional(),
    webhook_url: z.string().url(),
    retry_count: z.number().int().min(0),
    created_at: z.date(),
});

/**
 * Email recipient extension
 */
export const emailRecipientSchema = baseRecipientSchema.extend({
    email: z.string().email(),
});

/**
 * SMS recipient extension
 */
export const smsRecipientSchema = baseRecipientSchema.extend({
    phone: z.string(),
});

/**
 * WhatsApp recipient extension
 */
export const whatsappRecipientSchema = baseRecipientSchema.extend({
    phone: z.string(),
});

/**
 * Push notification recipient extension
 */
export const pushRecipientSchema = baseRecipientSchema.extend({
    device_token: z.string(),
});

/**
 * Basic email content schema
 */
export const emailContentSchema = z.object({
    subject: z.string().optional(),
    html: z.string().optional(),
    text: z.string().optional(),
}).refine(
    data => data.html || data.text,
    { message: 'Either html or text content is required' }
);

/**
 * Basic SMS content schema
 */
export const smsContentSchema = z.object({
    message: z.string().max(1600),
});

/**
 * Basic WhatsApp content schema
 */
export const whatsappContentSchema = z.object({
    message: z.string(),
});

/**
 * Create a complete notification schema for a channel
 */
export function createNotificationSchema<
    R extends z.ZodObject<Record<string, z.ZodTypeAny>>,
    C extends z.ZodObject<Record<string, z.ZodTypeAny>>
>(
    channelName: string,
    recipientSchema: R,
    contentSchema: C
) {
    return baseNotificationSchema.extend({
        channel: z.literal(channelName),
        recipient: recipientSchema,
        content: contentSchema,
    });
}
