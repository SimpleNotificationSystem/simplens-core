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
 * Helper to parse byte size from number or string representation (e.g. "25MB", "10KB", "26214400")
 */
export function parseByteSize(val: unknown): number | undefined {
    if (typeof val === 'number') {
        return Number.isFinite(val) && val > 0 ? Math.floor(val) : undefined;
    }
    if (typeof val !== 'string') {
        return undefined;
    }
    const trimmed = val.trim();
    if (!trimmed) return undefined;

    // Direct integer
    if (/^\d+$/.test(trimmed)) {
        const parsed = parseInt(trimmed, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }

    // Multiplication expression like "18 * 1024 * 1024"
    if (/^[\d\s*]+$/.test(trimmed) && trimmed.includes('*')) {
        const parts = trimmed.split('*').map(p => parseInt(p.trim(), 10));
        if (parts.every(p => Number.isFinite(p) && p > 0)) {
            return parts.reduce((acc, curr) => acc * curr, 1);
        }
    }

    // Units: B, KB, MB, GB, TB
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);
    if (!match) return undefined;

    const num = parseFloat(match[1]);
    const unit = (match[2] || 'b').toUpperCase();

    if (!Number.isFinite(num) || num <= 0) return undefined;

    switch (unit) {
        case 'B':
            return Math.floor(num);
        case 'K':
        case 'KB':
        case 'KIB':
            return Math.floor(num * 1024);
        case 'M':
        case 'MB':
        case 'MIB':
            return Math.floor(num * 1024 * 1024);
        case 'G':
        case 'GB':
        case 'GIB':
            return Math.floor(num * 1024 * 1024 * 1024);
        case 'T':
        case 'TB':
        case 'TIB':
            return Math.floor(num * 1024 * 1024 * 1024 * 1024);
        default:
            return undefined;
    }
}

/**
 * Resolves effective file attachment configuration by merging plugin manifest defaults
 * with provider instance options / optional configuration.
 */
export function resolveFileAttachmentConfig(
    manifestConfig?: FileAttachmentConfig,
    options?: Record<string, unknown>
): FileAttachmentConfig | undefined {
    if (!manifestConfig && !options) {
        return undefined;
    }

    const base: FileAttachmentConfig = manifestConfig ? { ...manifestConfig } : { enabled: false };

    if (!options || typeof options !== 'object') {
        return base;
    }

    // 1. Check nested options.fileAttachment
    const nested = (options.fileAttachment && typeof options.fileAttachment === 'object')
        ? (options.fileAttachment as Record<string, unknown>)
        : undefined;

    // 2. Resolve 'enabled'
    const enabledRaw = nested?.enabled 
        ?? options.ATTACHMENT_ENABLED 
        ?? options.attachmentEnabled 
        ?? options.enabled;
    if (enabledRaw !== undefined) {
        if (typeof enabledRaw === 'boolean') {
            base.enabled = enabledRaw;
        } else if (typeof enabledRaw === 'string') {
            base.enabled = enabledRaw.toLowerCase() === 'true' || enabledRaw === '1';
        }
    }

    // 3. Resolve 'maxFileSize'
    const maxFileSizeRaw = nested?.maxFileSize 
        ?? options.ATTACHMENT_MAX_FILE_SIZE 
        ?? options.MAX_FILE_SIZE 
        ?? options.attachmentMaxFileSize 
        ?? options.maxFileSize;
    const parsedFileSize = parseByteSize(maxFileSizeRaw);
    if (parsedFileSize !== undefined) {
        base.maxFileSize = parsedFileSize;
    }

    // 4. Resolve 'maxCount'
    const maxCountRaw = nested?.maxCount 
        ?? options.ATTACHMENT_MAX_COUNT 
        ?? options.MAX_COUNT 
        ?? options.attachmentMaxCount 
        ?? options.maxCount;
    if (maxCountRaw !== undefined) {
        const count = typeof maxCountRaw === 'number' ? maxCountRaw : parseInt(String(maxCountRaw).trim(), 10);
        if (Number.isFinite(count) && count > 0) {
            base.maxCount = Math.floor(count);
        }
    }

    // 5. Resolve 'allowedMimeTypes'
    const mimeRaw = nested?.allowedMimeTypes 
        ?? options.ATTACHMENT_ALLOWED_MIME_TYPES 
        ?? options.ALLOWED_MIME_TYPES 
        ?? options.attachmentAllowedMimeTypes 
        ?? options.allowedMimeTypes;
    if (mimeRaw !== undefined) {
        if (Array.isArray(mimeRaw)) {
            base.allowedMimeTypes = mimeRaw.map(m => String(m).trim()).filter(Boolean);
        } else if (typeof mimeRaw === 'string') {
            base.allowedMimeTypes = mimeRaw.split(',').map(m => m.trim()).filter(Boolean);
        }
    }

    return base;
}

/**
 * Format bytes helper for human-readable error messages
 */
function formatBytesForError(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, '')} GB`;
    }
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
    }
    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
    }
    return `${bytes} B`;
}

/**
 * Helper to build an attachment array schema tailored to a provider's constraints
 */
export function createFileAttachmentArraySchema(config?: FileAttachmentConfig): z.ZodType<FileAttachmentItem[]> {
    let schema: z.ZodType<FileAttachmentItem[]> = z.array(fileAttachmentItemSchema);

    if (config?.enabled === false) {
        return (schema as z.ZodArray<typeof fileAttachmentItemSchema>).max(
            0,
            'File attachments are disabled for this provider'
        );
    }

    if (config?.maxCount !== undefined && config.maxCount >= 0) {
        schema = (schema as z.ZodArray<typeof fileAttachmentItemSchema>).max(
            config.maxCount,
            config.maxCount === 0
                ? 'File attachments are disabled for this provider'
                : `Cannot attach more than ${config.maxCount} files (limit exceeded)`
        );
    }

    if (config?.maxFileSize || (config?.allowedMimeTypes && config.allowedMimeTypes.length > 0)) {
        schema = schema.superRefine((attachments, ctx) => {
            for (let i = 0; i < attachments.length; i++) {
                const att = attachments[i];
                if (config.maxFileSize && att.size > config.maxFileSize) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: [i, 'size'],
                        message: `Attachment '${att.filename}' (${formatBytesForError(att.size)}) exceeds maximum allowed size of ${formatBytesForError(config.maxFileSize)} for this provider.`,
                    });
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
                    if (!allowed) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: [i, 'mime_type'],
                            message: `Attachment '${att.filename}' has unsupported MIME type '${att.mime_type}'. Allowed types for this provider: ${config.allowedMimeTypes.join(', ')}.`,
                        });
                    }
                }
            }
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
