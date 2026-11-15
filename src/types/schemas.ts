/**
 * Core Schemas for SimpleNS
 *
 * These are channel-agnostic base schemas.
 * Channel-specific schemas are provided by plugins.
 */

import { z } from "zod";
import mongoose from "mongoose";
import {
  NOTIFICATION_STATUS,
  OUTBOX_STATUS,
  NOTIFICATION_STATUS_SF,
  ALERT_TYPE,
  type FieldDefinition,
  type FieldType,
  type FileAttachmentConfig,
} from "./types.js";
import type { UUID } from "crypto";
import { validate, version } from "uuid";

// ============================================================================
// BASE FIELD SCHEMAS
// ============================================================================

export const objectIdSchema = z.custom<mongoose.Types.ObjectId>(
  (val) => mongoose.Types.ObjectId.isValid(val as string),
  { error: "Invalid ObjectId" },
);

export const UUIDV4Schema = z.custom<UUID>(
  (val) => validate(val) && version(val as string) == 4,
  { error: "Invalid UUIDV4" },
);

export const variablesSchema = z.record(z.string(), z.string());

const hasNonEmptyTemplateIds = (
  templateIds?: (string | null | undefined)[],
) => Array.isArray(templateIds) && templateIds.some((id) => Boolean(id));

const hasNonEmptyContent = (
  content?: Record<string, Record<string, unknown>>,
) => !!content && Object.keys(content).length > 0;

export const providerAttemptSchema = z.object({
  provider: z.string(),
  status: z.enum(['delivered', 'failed', 'rate_limited']),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
  retryable: z.boolean().optional(),
  attempted_at: z.coerce.date(),
  duration_ms: z.number().optional(),
  response: z.unknown().optional(),
});

const notificationPayloadFields = {
  request_id: UUIDV4Schema,
  client_id: UUIDV4Schema,
  client_name: z.string().optional(),
  channel: z.string(),
  provider: z.string().optional(),
  provider_history: z.array(providerAttemptSchema).optional(),
  recipient: z.record(z.string(), z.unknown()),
  content: z.record(z.string(), z.unknown()),
  variables: variablesSchema.optional(),
  webhook_url: z.url(),
  scheduled_at: z.coerce.date().optional(),
};

const notificationRequestFields = {
  client_id: UUIDV4Schema,
  client_name: z.string().optional(),
  channel: z.array(z.string()).min(1, "At least one channel is required."),
  template_id: z.array(z.string().nullable().optional()).optional(),
  provider: z
    .union([z.string(), z.array(z.string().nullable().optional())])
    .optional(),
  content: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  scheduled_at: z.coerce.date().optional(),
  webhook_url: z.url(),
};

const notificationTemplateFields = {
  name: z.string(),
  description: z.string().optional(),
  content: z.record(z.string(), z.unknown()),
  package: z.string(),
};

// ============================================================================
// BASE NOTIFICATION SCHEMA (Channel-Agnostic)
// ============================================================================

/**
 * Base notification schema - plugins extend this with channel-specific fields
 */
export const baseNotificationSchema = z.object({
  notification_id: objectIdSchema,
  ...notificationPayloadFields,
  retry_count: z.number().int().min(0),
  created_at: z.coerce.date(),
});

// ============================================================================
// CORE TOPIC SCHEMAS
// ============================================================================

/**
 * Delayed notification - supports any channel
 */
export const delayedNotificationTopicSchema = z.object({
  notification_id: objectIdSchema,
  request_id: UUIDV4Schema,
  client_id: UUIDV4Schema,
  scheduled_at: z.coerce.date(),
  target_topic: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.coerce.date(),
});

/**
 * Notification status - channel-agnostic
 */
export const notificationStatusTopicSchema = z.object({
  notification_id: objectIdSchema,
  request_id: UUIDV4Schema,
  client_id: UUIDV4Schema,
  channel: z.string(),
  provider: z.string().optional(),
  provider_history: z.array(providerAttemptSchema).optional(),
  status: z.enum(NOTIFICATION_STATUS_SF),
  message: z.string(),
  retry_count: z.number().int().min(0),
  webhook_url: z.url(),
  created_at: z.coerce.date(),
});

// ============================================================================
// DATABASE SCHEMAS
// ============================================================================

/**
 * Notification record in MongoDB
 */
export const notificationSchema = z.object({
  ...notificationPayloadFields,
  status: z.enum(NOTIFICATION_STATUS),
  error_message: z.string().optional(),
  retry_count: z.number().int().min(0),
  api_key_id: z.string().nullable().optional(),
  // Recovery claiming fields for horizontal scalability
  recovery_claimed_by: z.string().nullable().optional(),
  recovery_claimed_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

/**
 * Outbox entry for reliable delivery
 */
export const outboxSchema = z.object({
  notification_id: objectIdSchema,
  topic: z.string(),
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(OUTBOX_STATUS),
  claimed_by: z.string().nullable().optional(),
  claimed_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

/**
 * Alert schema
 */
export const alertSchema = z.object({
  notification_id: objectIdSchema,
  alert_type: z.enum(ALERT_TYPE),
  reason: z.string(),
  redis_status: z.string().nullable().optional(),
  db_status: z.enum(NOTIFICATION_STATUS),
  retry_count: z.number().int().min(0),
  resolved: z.boolean().default(false),
  resolved_at: z.coerce.date().nullable().optional(),
  // Recovery claiming fields for horizontal scalability
  recovery_claimed_by: z.string().nullable().optional(),
  recovery_claimed_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

/**
 * Status outbox
 */
export const statusOutboxSchema = z.object({
  _id: objectIdSchema,
  notification_id: objectIdSchema,
  status: z.enum(NOTIFICATION_STATUS_SF),
  provider: z.string().optional(),
  provider_history: z.array(providerAttemptSchema).optional(),
  processed: z.boolean().default(false),
  claimed_by: z.string().nullable().optional(),
  claimed_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

/**
 * Notification Template
 */
export const notificationTemplateSchema = z.object({
  _id: objectIdSchema,
  name: z.string(),
  template_id: z.string(),
  description: z.string().optional(),
  content: z.record(z.string(), z.unknown()),
  package: z.string(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

// ============================================================================
// ADMIN NOTIFICATION CHANNEL SCHEMAS
// ============================================================================

/**
 * Admin alert channel types
 */
export const ADMIN_CHANNEL_TYPE = ['discord', 'telegram', 'email', 'slack'] as const;

/**
 * Admin alert types for filtering
 */
export const ADMIN_ALERT_TYPE = [
    'failed_notification',
    'service_health',
    'stuck_processing',
    'orphaned_pending',
    'ghost_delivery'
] as const;

/**
 * Encrypted config schema - used for storing sensitive channel credentials
 */
export const encryptedConfigSchema = z.object({
    encrypted_data: z.string(),
    iv: z.string(),
    auth_tag: z.string(),
});

/**
 * Alert filters schema - controls which alert types a channel receives
 */
export const alertFiltersSchema = z.object({
    failed_notifications: z.boolean().default(true),
    service_health: z.boolean().default(true),
    stuck_processing: z.boolean().default(true),
    orphaned_pending: z.boolean().default(true),
    ghost_delivery: z.boolean().default(false),
});

/**
 * Admin notification channel schema
 */
export const adminChannelSchema = z.object({
    channel_type: z.enum(ADMIN_CHANNEL_TYPE),
    name: z.string().min(1).max(100),
    enabled: z.boolean().default(true),
    config: encryptedConfigSchema,
    alert_filters: alertFiltersSchema,
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

/**
 * System config schema - for storing system-wide config like encryption keys
 */
export const systemConfigSchema = z.object({
    key: z.string(),
    value: z.unknown(),
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

/**
 * Key-pair envelope encrypted credentials schema
 */
export const encryptedCredentialsSchema = z.object({
    encrypted_data: z.string(),
    iv: z.string(),
    auth_tag: z.string(),
    encrypted_dek: z.string(),
});

/**
 * File attachment configuration schema for providers
 */
export const fileAttachmentConfigSchema = z.object({
    enabled: z.boolean().optional(),
    maxFileSize: z.number().int().positive().optional(),
    maxCount: z.number().int().positive().optional(),
    allowedMimeTypes: z.array(z.string()).optional(),
});

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
export function createFileAttachmentArraySchema(config?: {
    enabled?: boolean;
    maxFileSize?: number;
    maxCount?: number;
    allowedMimeTypes?: string[];
}): z.ZodType<Array<z.infer<typeof fileAttachmentItemSchema>>> {
    let schema: z.ZodType<Array<z.infer<typeof fileAttachmentItemSchema>>> = z.array(fileAttachmentItemSchema);

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
 * Provider manifest schema for plugins
 */
export const providerManifestSchema = z.object({
    name: z.string(),
    version: z.string(),
    channel: z.string(),
    displayName: z.string(),
    description: z.string(),
    author: z.string().optional(),
    homepage: z.string().optional(),
    requiredCredentials: z.array(z.string()),
    optionalConfig: z.array(z.string()).optional(),
    fileAttachment: fileAttachmentConfigSchema.optional(),
});

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
    manifestConfig?: {
        enabled?: boolean;
        maxFileSize?: number;
        maxCount?: number;
        allowedMimeTypes?: string[];
    },
    options?: Record<string, unknown>
): {
    enabled?: boolean;
    maxFileSize?: number;
    maxCount?: number;
    allowedMimeTypes?: string[];
} | undefined {
    if (!manifestConfig && !options) {
        return undefined;
    }

    const base = manifestConfig ? { ...manifestConfig } : { enabled: false };

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

type ZodDefNode = {
    typeName?: string;
    type?: string;
    innerType?: unknown;
    schema?: unknown;
    in?: unknown;
    element?: unknown;
    shape?: Record<string, unknown>;
    values?: unknown;
    options?: unknown;
    checks?: Array<{ kind?: string; format?: string; def?: { format?: string }; constructor?: { name?: string } }>;
    description?: string;
    defaultValue?: unknown;
};

type ZodInternalNode = {
    isOptional?: () => boolean;
    isNullable?: () => boolean;
    description?: string;
    type?: string;
    _def?: ZodDefNode;
    def?: ZodDefNode;
    element?: unknown;
    shape?: Record<string, unknown>;
    options?: unknown;
    constructor?: { name?: string };
};

/**
 * Unwraps Zod schema modifiers (optional, nullable, default, effects/superRefine, pipe, etc.)
 * across both Zod 3 and Zod 4.
 */
export function unwrapZodSchema(schema: unknown): { inner: unknown; isOptional: boolean; description?: string; defaultValue?: unknown } {
    let current: ZodInternalNode | null = (schema && typeof schema === 'object') ? (schema as ZodInternalNode) : null;
    let isOptional = false;
    let description = current?.description || current?._def?.description || current?.def?.description;
    let defaultValue: unknown = undefined;

    while (current) {
        if (typeof current.isOptional === 'function' && current.isOptional()) {
            isOptional = true;
        }
        if (typeof current.isNullable === 'function' && current.isNullable()) {
            isOptional = true;
        }
        const typeName = current._def?.typeName || current.def?.typeName;
        const type = current.type || current._def?.type || current.def?.type;

        if (typeName === 'ZodOptional' || typeName === 'ZodNullable' || type === 'optional' || type === 'nullable') {
            isOptional = true;
        }
        if (typeName === 'ZodDefault' || type === 'default') {
            isOptional = true;
            defaultValue = current._def?.defaultValue ?? current.def?.defaultValue;
            if (typeof defaultValue === 'function') {
                try { defaultValue = defaultValue(); } catch { /* ignore */ }
            }
        }

        if (current.description) description = current.description;

        const nextInner = current.def?.innerType
            || current._def?.innerType
            || current.def?.schema
            || current._def?.schema
            || current.def?.in
            || current._def?.in;

        if (nextInner && typeof nextInner === 'object') {
            current = nextInner as ZodInternalNode;
        } else {
            break;
        }
    }

    return { inner: current, isOptional, description, defaultValue };
}

/**
 * Checks whether an object shape represents a FileAttachment item
 * (e.g. matching fileAttachmentItemSchema).
 */
export function isAttachmentItemShape(shape: unknown): boolean {
    if (!shape || typeof shape !== 'object') return false;
    const s = shape as Record<string, unknown>;
    const hasId = 'id' in s || 'fileId' in s || 'file_id' in s;
    const hasFilename = 'filename' in s || 'name' in s;
    const hasMime = 'mime_type' in s || 'contentType' in s || 'mime' in s;
    const hasSize = 'size' in s;
    const hasHash = 'hash' in s;
    return Boolean(hasId && (hasFilename || hasMime || hasSize || hasHash));
}

/**
 * Checks if a schema structurally matches an attachment array or attachment item.
 */
export function isAttachmentZodSchema(schema: unknown, fieldName?: string, attachmentConfig?: FileAttachmentConfig): boolean {
    const { inner } = unwrapZodSchema(schema);
    const node = inner as ZodInternalNode | null;
    const typeStr = node?.type || node?._def?.type || node?.def?.type || '';
    const typeName = node?._def?.typeName || node?.def?.typeName || '';
    const constructorName = node?.constructor?.name || '';
    const isArr = typeStr === 'array' || typeName === 'ZodArray' || constructorName === 'ZodArray';

    if (isArr) {
        const rawElem = node?.element || node?.def?.element || node?._def?.element;
        const { inner: elemInner } = unwrapZodSchema(rawElem);
        const elemNode = elemInner as ZodInternalNode | null;
        const elemShape = elemNode?.shape || elemNode?.def?.shape || elemNode?._def?.shape;
        if (isAttachmentItemShape(elemShape)) {
            return true;
        }
        if (fieldName === 'attachments' && attachmentConfig && attachmentConfig.enabled !== false) {
            return true;
        }
    } else {
        const shape = node?.shape || node?.def?.shape || node?._def?.shape;
        if (isAttachmentItemShape(shape)) {
            return true;
        }
    }

    return false;
}

/**
 * Recursively extracts rich FieldDefinition array from any arbitrary Zod schema.
 */
export function extractFieldDefinitionsFromZod(
    schema: unknown,
    attachmentConfig?: FileAttachmentConfig
): FieldDefinition[] {
    if (!schema || typeof schema !== 'object') {
        return [];
    }

    const { inner } = unwrapZodSchema(schema);
    const node = inner as ZodInternalNode | null;
    const shape = node?.shape ?? node?.def?.shape ?? node?._def?.shape;
    if (!shape || typeof shape !== 'object') {
        return [];
    }

    const fields: FieldDefinition[] = [];

    for (const [name, rawField] of Object.entries(shape)) {
        const { inner: fieldSchema, isOptional, description, defaultValue } = unwrapZodSchema(rawField);
        const fieldNode = fieldSchema as ZodInternalNode | null;
        const typeName = fieldNode?._def?.typeName || fieldNode?.def?.typeName || '';
        const typeStr = fieldNode?.type || fieldNode?._def?.type || fieldNode?.def?.type || '';
        const constructorName = fieldNode?.constructor?.name || '';
        const checks = fieldNode?._def?.checks || fieldNode?.def?.checks || [];

        const isArr = typeStr === 'array' || typeName === 'ZodArray' || constructorName === 'ZodArray';
        const isObj = typeStr === 'object' || typeName === 'ZodObject' || constructorName === 'ZodObject';
        const isNum = typeStr === 'number' || typeName === 'ZodNumber' || constructorName === 'ZodNumber';
        const isBool = typeStr === 'boolean' || typeName === 'ZodBoolean' || constructorName === 'ZodBoolean';
        const isStr = typeStr === 'string' || typeName === 'ZodString' || constructorName === 'ZodString';
        const isEnm = typeStr === 'enum' || typeName === 'ZodEnum' || constructorName === 'ZodEnum';

        if (isArr) {
            const rawElem = fieldNode?.element || fieldNode?.def?.element || fieldNode?._def?.element;
            const { inner: elemInner } = unwrapZodSchema(rawElem);
            const elemNode = elemInner as ZodInternalNode | null;
            const elemShape = elemNode?.shape || elemNode?.def?.shape || elemNode?._def?.shape;

            if (isAttachmentItemShape(elemShape) || (name === 'attachments' && attachmentConfig && attachmentConfig.enabled !== false)) {
                fields.push({
                    name,
                    type: 'attachment',
                    required: !isOptional,
                    description,
                    defaultValue,
                    ...(attachmentConfig ? { attachmentConfig } : {}),
                });
            } else {
                const elemTypeStr = elemNode?.type || elemNode?._def?.type || elemNode?._def?.typeName || elemNode?.constructor?.name || '';
                let itemType: FieldType = 'string';
                let itemFields: FieldDefinition[] | undefined;

                if (elemTypeStr === 'number' || elemTypeStr === 'ZodNumber') {
                    itemType = 'number';
                } else if (elemTypeStr === 'boolean' || elemTypeStr === 'ZodBoolean') {
                    itemType = 'boolean';
                } else if (elemShape && typeof elemShape === 'object') {
                    itemType = 'object';
                    itemFields = extractFieldDefinitionsFromZod(elemInner, attachmentConfig);
                }

                fields.push({
                    name,
                    type: 'array',
                    itemType,
                    itemFields,
                    required: !isOptional,
                    description,
                    defaultValue,
                });
            }
        } else if (isObj) {
            const childFields = extractFieldDefinitionsFromZod(fieldSchema, attachmentConfig);
            fields.push({
                name,
                type: 'object',
                required: !isOptional,
                description,
                defaultValue,
                fields: childFields,
            });
        } else if (isEnm) {
            const rawValues = fieldNode?._def?.values || fieldNode?.def?.values || fieldNode?.options || [];
            const values = Array.isArray(rawValues)
                ? rawValues.map(v => String(v))
                : typeof rawValues === 'object' && rawValues !== null
                    ? Object.keys(rawValues)
                    : [];
            fields.push({
                name,
                type: 'enum',
                enumValues: values,
                required: !isOptional,
                description,
                defaultValue,
            });
        } else if (isNum) {
            fields.push({
                name,
                type: 'number',
                required: !isOptional,
                description,
                defaultValue,
            });
        } else if (isBool) {
            fields.push({
                name,
                type: 'boolean',
                required: !isOptional,
                description,
                defaultValue,
            });
        } else if (isStr) {
            const hasEmail = checks.some((c) => c.kind === 'email' || c.format === 'email' || c.def?.format === 'email' || c.constructor?.name === 'ZodEmail');
            const hasUrl = checks.some((c) => c.kind === 'url' || c.format === 'url' || c.def?.format === 'url' || c.constructor?.name === 'ZodUrl');
            let detectedType: FieldType = 'string';
            if (hasEmail) detectedType = 'email';
            else if (hasUrl) detectedType = 'url';
            else if (name.toLowerCase().includes('phone')) detectedType = 'phone';
            else if (name.toLowerCase().includes('message') || name.toLowerCase().includes('body') || name.toLowerCase().includes('html')) detectedType = 'text';

            fields.push({
                name,
                type: detectedType,
                required: !isOptional,
                description,
                defaultValue,
            });
        } else {
            fields.push({
                name,
                type: 'string',
                required: !isOptional,
                description,
                defaultValue,
            });
        }
    }

    return fields;
}

  /** Options supplied by a YAML/JSON provider configuration entry. */
  export const providerConfigOptionsSchema = z.object({
    priority: z.number().int().optional(),
    rateLimit: z.object({
      maxTokens: z.number().nonnegative().optional(),
      refillRate: z.number().nonnegative().optional(),
      refillInterval: z.enum(['second', 'minute', 'hour', 'day']).optional(),
    }).optional(),
    fileAttachment: fileAttachmentConfigSchema.optional(),
  }).catchall(z.unknown());

  /** Provider entry as read from YAML/JSON configuration. */
  export const providerConfigEntrySchema = z.object({
    package: z.string().min(1),
    version: z.string().optional(),
    id: z.string().min(1),
    credentials: z.record(z.string(), z.string()).optional(),
    optionalConfig: z.record(z.string(), z.string()).optional(),
    options: providerConfigOptionsSchema.optional(),
  });

/**
 * Plugin document schema
 */
export const pluginSchema = z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    status: z.enum(['installed', 'installing', 'failed']),
    error: z.string().optional(),
    manifest: providerManifestSchema,
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

/**
 * Provider document schema
 */
export const providerSchema = z.object({
    id: z.string().min(1),
    plugin_name: z.string().min(1),
    channel: z.string().min(1),
    enabled: z.boolean().default(true),
    credentials: encryptedCredentialsSchema,
  options: providerConfigOptionsSchema.optional(),
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

/**
 * Channel routing document schema
 */
export const channelRoutingSchema = z.object({
    channel: z.string().min(1),
    default_provider_id: z.string().min(1),
    fallback_provider_ids: z.array(z.string()).default([]),
    partitions: z.number().int().min(1).default(6),
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

/**
 * Discord config schema - for validation before encryption
 */
export const discordConfigSchema = z.object({
    webhook_url: z.string().url().refine(
        (url) => url.startsWith('https://discord.com/api/webhooks/'),
        { message: 'Must be a valid Discord webhook URL' }
    ),
});

/**
 * Telegram config schema
 */
export const telegramConfigSchema = z.object({
    bot_token: z.string().regex(/^[0-9]+:[a-zA-Z0-9_-]+$/, 'Invalid Telegram Bot Token'),
    chat_id: z.string().regex(/^-?[0-9]+$/, 'Invalid Chat ID'),
});

// ============================================================================
// API REQUEST SCHEMAS
// ============================================================================

/**
 * Single notification request - channel-agnostic
 */
export const baseNotificationRequestSchema = z
  .object({
    request_id: UUIDV4Schema,
    ...notificationRequestFields,
    recipient: z.record(z.string(), z.unknown()),
    variables: variablesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (
      !hasNonEmptyTemplateIds(data.template_id) &&
      !hasNonEmptyContent(data.content)
    ) {
      for (const path of ["template_id", "content"] as const) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Either a non-empty template_id array or non-empty content must be present.",
          path: [path],
        });
      }
    }
  });

/**
 * Batch notification request - channel-agnostic
 */
export const baseBatchNotificationRequestSchema = z
  .object({
    ...notificationRequestFields,
    recipients: z.array(
      z.looseObject({
        request_id: UUIDV4Schema,
        user_id: z.string(),
        variables: variablesSchema.optional(),
      }),
    ).min(1, "At least one recipient is required."),
  })
  .superRefine((data, ctx) => {
    const maxLimit =
      typeof process !== "undefined" && process.env.MAX_BATCH_REQ_LIMIT
        ? parseInt(process.env.MAX_BATCH_REQ_LIMIT)
        : 1000;
    if (
      data.recipients &&
      data.recipients.length * data.channel.length > maxLimit
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Batch size exceeds limit (${maxLimit})`,
        path: ["recipients"],
      });
    }
  })
  .superRefine((data, ctx) => {
    if (
      !hasNonEmptyTemplateIds(data.template_id) &&
      !hasNonEmptyContent(data.content)
    ) {
      for (const path of ["template_id", "content"] as const) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Either a non-empty template_id array or non-empty content must be present.",
          path: [path],
        });
      }
    }
  });

/*
Notification Template Request Schema
*/
export const notificationTemplateRequestSchema = z.object({
  ...notificationTemplateFields,
  template_id: z.string().optional(),
});

export const notificationTemplateUpdateRequestSchema = z.object(notificationTemplateFields);

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export const validateBaseNotification = (data: unknown) =>
  baseNotificationSchema.parse(data);
export const validateDelayedNotificationTopic = (data: unknown) =>
  delayedNotificationTopicSchema.parse(data);
export const validateNotificationStatusTopic = (data: unknown) =>
  notificationStatusTopicSchema.parse(data);
export const validateNotification = (data: unknown) =>
  notificationSchema.parse(data);
export const validateOutbox = (data: unknown) => outboxSchema.parse(data);
export const validateNotificationRequest = (data: unknown) =>
  baseNotificationRequestSchema.parse(data);
export const validateBatchNotificationRequest = (data: unknown) =>
  baseBatchNotificationRequestSchema.parse(data);
export const validateNotificationTemplate = (data: unknown) =>
  notificationTemplateSchema.parse(data);
export const validateNotificationTemplateRequestSchema = (data: unknown) =>
  notificationTemplateRequestSchema.parse(data);
export const validateNotificationTemplateUpdateRequestSchema = (data: unknown) =>
  notificationTemplateUpdateRequestSchema.parse(data);

export const safeValidateBaseNotification = (data: unknown) =>
  baseNotificationSchema.safeParse(data);
export const safeValidateDelayedNotificationTopic = (data: unknown) =>
  delayedNotificationTopicSchema.safeParse(data);
export const safeValidateNotificationStatusTopic = (data: unknown) =>
  notificationStatusTopicSchema.safeParse(data);
export const safeValidateNotification = (data: unknown) =>
  notificationSchema.safeParse(data);
export const safeValidateOutbox = (data: unknown) =>
  outboxSchema.safeParse(data);
export const safeValidateNotificationRequest = (data: unknown) =>
  baseNotificationRequestSchema.safeParse(data);
export const safeValidateBatchNotificationRequest = (data: unknown) =>
  baseBatchNotificationRequestSchema.safeParse(data);
export const safeValidateNotificationTemplate = (data: unknown) =>
  notificationTemplateSchema.safeParse(data);
export const safeValidateNotificationTemplateRequestSchema = (data: unknown) =>
  notificationTemplateRequestSchema.safeParse(data);
export const safeValidateNotificationTemplateUpdateRequestSchema = (data: unknown) =>
  notificationTemplateUpdateRequestSchema.safeParse(data);

// ============================================================================
// DYNAMIC OPERATIONAL SETTINGS & ADMIN AUTH SCHEMAS
// ============================================================================

export const attachmentSettingsSchema = z.object({
  max_file_size: z.number().int().min(1024).max(500 * 1024 * 1024).default(100 * 1024 * 1024),
  max_file_count: z.number().int().min(1).max(50).default(10),
});

export const operationalSettingsSchema = z.object({
  api: z.object({
    max_batch_req_limit: z.number().int().min(10).max(10000).default(1000),
  }),
  worker: z.object({
    outbox_poll_interval_ms: z.number().int().min(500).max(60000).default(5000),
    outbox_cleanup_interval_ms: z.number().int().min(5000).max(600000).default(60000),
    outbox_batch_size: z.number().int().min(1).max(2000).default(100),
    outbox_retention_ms: z.number().int().min(10000).max(86400000).default(300000),
    outbox_claim_timeout_ms: z.number().int().min(5000).max(300000).default(30000),
  }),
  retry: z.object({
    max_retry_count: z.number().int().min(1).max(30).default(5),
    idempotency_ttl_seconds: z.number().int().min(60).max(2592000).default(86400),
    processing_ttl_seconds: z.number().int().min(10).max(1800).default(120),
    rate_limit_retry_delay_ms: z.number().int().min(100).max(60000).default(5000),
  }),
  delayed: z.object({
    delayed_poll_interval_ms: z.number().int().min(200).max(30000).default(1000),
    delayed_batch_size: z.number().int().min(1).max(500).default(10),
    max_poller_retries: z.number().int().min(1).max(10).default(3),
  }),
  recovery: z.object({
    recovery_poll_interval_ms: z.number().int().min(5000).max(600000).default(60000),
    processing_stuck_threshold_ms: z.number().int().min(10000).max(3600000).default(300000),
    pending_stuck_threshold_ms: z.number().int().min(10000).max(3600000).default(300000),
    recovery_batch_size: z.number().int().min(1).max(500).default(50),
    recovery_claim_timeout_ms: z.number().int().min(5000).max(300000).default(60000),
    cleanup_resolved_alerts_retention_ms: z.number().int().min(60000).max(2592000000).default(86400000),
    cleanup_processed_status_outbox_retention_ms: z.number().int().min(60000).max(2592000000).default(86400000),
    cleanup_delivered_attachments_retention_ms: z.preprocess(
      (val) => (val === '' || val === null || val === undefined || val === 0 ? null : Number(val)),
      z.number().int().min(60000).max(2592000000).nullable().optional()
    ).default(86400000),
  }),
  logging: z.object({
    log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    log_to_file: z.boolean().default(true),
  }),
  attachment: attachmentSettingsSchema.default({
    max_file_size: 100 * 1024 * 1024,
    max_file_count: 10,
  }),
});

export const partialOperationalSettingsSchema = z.object({
  api: operationalSettingsSchema.shape.api.partial().optional(),
  worker: operationalSettingsSchema.shape.worker.partial().optional(),
  retry: operationalSettingsSchema.shape.retry.partial().optional(),
  delayed: operationalSettingsSchema.shape.delayed.partial().optional(),
  recovery: operationalSettingsSchema.shape.recovery.partial().optional(),
  logging: operationalSettingsSchema.shape.logging.partial().optional(),
  attachment: attachmentSettingsSchema.partial().optional(),
});

export const adminSetupSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(50, "Username cannot exceed 50 characters"),
  password: z.string().min(8, "Password must be at least 8 characters").max(64, "Password cannot exceed 64 characters"),
});

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

/**
 * npm registry configuration schema for individual custom registries/scopes
 */
export const npmRegistryConfigSchema = z.object({
  id: z.string().optional(),
  scope: z.string().trim().optional(),
  registry_url: z.string().url("Invalid registry URL").default("https://registry.npmjs.org/"),
  token: z.string().min(1, "npm token cannot be empty"),
});

/**
 * npm registry status item for public/dashboard display
 */
export const npmRegistryStatusSchema = z.object({
  id: z.string(),
  scope: z.string().optional(),
  registry_url: z.string(),
  masked_token: z.string(),
  updated_at: z.string(),
});

/**
 * npm registry authentication config schema
 */
export const npmAuthConfigSchema = z.object({
  token: z.string().min(1, "npm token cannot be empty"),
  registry_url: z.string().url("Invalid registry URL").default("https://registry.npmjs.org/"),
  scope: z.string().trim().optional(),
});

/**
 * npm registry auth status schema (safe to return to UI with masked token and registry list)
 */
export const npmAuthStatusSchema = z.object({
  is_configured: z.boolean(),
  registries: z.array(npmRegistryStatusSchema).default([]),
  default_registry: z.string().optional(),
  masked_token: z.string().optional(),
});

/**
 * Payload schema for installing a plugin package
 */
/**
 * Strict npm package name schema preventing shell injection and metacharacters
 */
export const npmPackageNameSchema = z.string()
  .min(1, 'Package name is required')
  .max(214, 'Package name cannot exceed 214 characters')
  .regex(/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i, 'Invalid npm package name format');

/**
 * Strict npm package version / tag schema
 */
export const npmPackageVersionSchema = z.string()
  .regex(
    /^(latest|\^?[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|~?[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/,
    'Invalid npm version or tag format'
  );

/**
 * Payload schema for changing plugin version
 */
export const changePluginVersionSchema = z.object({
  package: npmPackageNameSchema,
  version: npmPackageVersionSchema,
});

/**
 * Schema for uninstalling a plugin
 */
export const uninstallPluginSchema = z.object({
  package: npmPackageNameSchema,
});

export const installPluginPayloadSchema = z.object({
  package: npmPackageNameSchema,
  version: npmPackageVersionSchema.optional(),
  auth: z.object({
    token: z.string().optional(),
    registry_url: z.string().url("Invalid registry URL").optional(),
    scope: z.string().optional(),
    save_token: z.boolean().default(true),
  }).optional(),
});

/**
 * Provider rate limit configuration schema
 */
export const providerRateLimitConfigDetailsSchema = z.object({
  max_tokens: z.number(),
  refill_rate: z.number(),
  refill_interval: z.enum(['second', 'minute', 'hour', 'day']),
  normalized_refill_rate: z.number(),
});

/**
 * Provider rate limit real-time status schema
 */
export const providerRateLimitRealtimeStatusSchema = z.object({
  remaining_tokens: z.number(),
  used_tokens: z.number(),
  usage_percentage: z.number(),
  is_exhausted: z.boolean(),
  resets_in_ms: z.number(),
  full_refill_in_ms: z.number(),
  last_refill_at: z.coerce.date().nullable(),
  last_exhausted_at: z.coerce.date().nullable(),
  exhausted_count: z.number(),
});

/**
 * Provider rate limit status item schema
 */
export const providerRateLimitStatusSchema = z.object({
  provider_id: z.string(),
  channel: z.string(),
  plugin_name: z.string(),
  display_name: z.string().optional(),
  enabled: z.boolean(),
  config: providerRateLimitConfigDetailsSchema,
  status: providerRateLimitRealtimeStatusSchema,
});

/**
 * Provider rate limit summary schema
 */
export const providerRateLimitSummarySchema = z.object({
  total_providers: z.number(),
  exhausted_providers: z.number(),
  healthy_providers: z.number(),
});

/**
 * Provider rate limit list response schema
 */
export const providerRateLimitListResponseSchema = z.object({
  providers: z.array(providerRateLimitStatusSchema),
  summary: providerRateLimitSummarySchema,
});

// ============================================================================
// API KEY & ADMIN AUTH SCHEMAS
// ============================================================================

export const apiKeyUsageSchema = z.object({
  total_requests: z.number().int().min(0).default(0),
  total_notifications: z.number().int().min(0).default(0),
  by_channel: z.record(z.string(), z.number().int().min(0)).default({}),
  last_used_at: z.coerce.date().nullable().optional(),
});

export const apiKeyStatusSchema = z.enum(['active', 'revoked']);

export const apiKeyTypeSchema = z.enum(['notification', 'admin']);

export const apiKeyDocSchema = z.object({
  key_id: z.string(),
  name: z.string(),
  type: apiKeyTypeSchema.default('notification'),
  key_prefix: z.string(),
  key_hash: z.string(),
  status: apiKeyStatusSchema,
  expires_at: z.coerce.date().nullable().optional(),
  usage: apiKeyUsageSchema,
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100),
  type: apiKeyTypeSchema.default('notification'),
  expires_at: z.coerce.date().optional(),
});

export const apiKeyResponseSchema = z.object({
  key_id: z.string(),
  name: z.string(),
  type: apiKeyTypeSchema,
  key_prefix: z.string(),
  status: apiKeyStatusSchema,
  expires_at: z.coerce.date().nullable().optional(),
  usage: apiKeyUsageSchema,
  created_at: z.coerce.date(),
});

export const createApiKeyResponseSchema = z.object({
  key: apiKeyResponseSchema,
  raw_key: z.string(),
});

export const apiHealthResponseSchema = z.object({
  service: z.string().optional(),
  status: z.enum(['healthy', 'unhealthy', 'ready', 'not_ready']),
  timestamp: z.string(),
  checks: z.record(z.string(), z.boolean()),
});

// ============================================================================
// STORAGE PROVIDER SCHEMAS
// ============================================================================

export const storageProviderCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  provider_type: z.string().trim().min(1, 'Provider type is required'),
  enabled: z.boolean().default(true),
  is_active: z.boolean().default(false),
  config: z.record(z.string(), z.string()),
});

export const storageProviderUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  is_active: z.boolean().optional(),
  config: z.record(z.string(), z.string()).optional(),
});

export const minioStorageConfigSchema = z.object({
  endPoint: z.string().trim().min(1, 'Endpoint is required'),
  port: z.union([z.number(), z.string()]).optional().transform((val) => {
    if (typeof val === 'string' && val.trim() !== '') {
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? undefined : parsed;
    }
    return typeof val === 'number' ? val : undefined;
  }),
  useSSL: z.union([z.boolean(), z.string()]).optional().transform((val) => {
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return Boolean(val);
  }),
  accessKey: z.string().trim().min(1, 'Access Key is required'),
  secretKey: z.string().trim().min(1, 'Secret Key is required'),
  bucket: z.string().trim().min(1, 'Bucket name is required'),
  region: z.string().trim().optional(),
});

