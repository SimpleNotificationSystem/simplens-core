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
    provider: z.string().optional(),
    variables: z.record(z.string(), z.string()).optional(),
    webhook_url: z.string().url(),
    retry_count: z.number().int().min(0),
    created_at: z.coerce.date(),
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

import type { FileAttachmentConfig, FileAttachmentItem } from '../interfaces/provider.interface.js';

/**
 * Standard file attachment item schema
 */
export const fileAttachmentItemSchema = z.object({
    id: z.string().min(1, 'File ID is required'),
    filename: z.string().min(1, 'Filename is required'),
    mime_type: z.string().min(1, 'MIME type is required'),
    size: z.number().nonnegative('Size cannot be negative'),
    hash: z.string().min(1, 'File hash is required'),
    url: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    buffer: z.any().optional(),
    stream: z.any().optional(),
});

/**
 * Standard array of file attachments
 */
export const fileAttachmentArraySchema = z.array(fileAttachmentItemSchema);

/**
 * Helper to build an attachment array schema tailored to a provider's constraints
 */
export function createFileAttachmentArraySchema(config?: FileAttachmentConfig): z.ZodType<FileAttachmentItem[]> {
    let schema: z.ZodType<FileAttachmentItem[]> = z.array(fileAttachmentItemSchema);

    if (config?.maxCount && config.maxCount > 0) {
        schema = (schema as z.ZodArray<typeof fileAttachmentItemSchema>).max(
            config.maxCount,
            `Cannot attach more than ${config.maxCount} files`
        );
    }

    if (config?.maxFileSize || (config?.allowedMimeTypes && config.allowedMimeTypes.length > 0)) {
        schema = schema.refine((attachments) => {
            for (const att of attachments) {
                if (config.maxFileSize && att.size > config.maxFileSize) {
                    return false;
                }
                if (config.allowedMimeTypes && config.allowedMimeTypes.length > 0) {
                    const allowed = config.allowedMimeTypes.some(pattern => {
                        if (pattern === '*/*' || pattern === '*') return true;
                        if (pattern.endsWith('/*')) {
                            const prefix = pattern.slice(0, -2);
                            return att.mime_type.startsWith(prefix);
                        }
                        return att.mime_type === pattern;
                    });
                    if (!allowed) return false;
                }
            }
            return true;
        }, {
            message: 'One or more attachments exceed file size or MIME type restrictions',
        });
    }

    return schema;
}

/**
 * Basic email content schema
 */
export const emailContentSchema = z.object({
    subject: z.string().optional(),
    html: z.string().optional(),
    text: z.string().optional(),
    attachments: fileAttachmentArraySchema.optional(),
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
