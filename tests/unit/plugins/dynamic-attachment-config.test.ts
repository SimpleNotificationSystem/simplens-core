import { describe, it, expect, beforeEach } from 'vitest';
import { parseByteSize, resolveFileAttachmentConfig, createFileAttachmentArraySchema } from '../../../src/types/schemas';
import { PluginRegistry } from '../../../src/plugins/loader/registry';
import type {
    SimpleNSProvider,
    ProviderManifest,
    FileAttachmentConfig,
    FieldDefinition,
} from '../../../src/types/types';
import { z } from 'zod';

describe('Dynamic File Attachment Configuration', () => {
    describe('parseByteSize', () => {
        it('should handle numbers correctly', () => {
            expect(parseByteSize(1024)).toBe(1024);
            expect(parseByteSize(18 * 1024 * 1024)).toBe(18874368);
            expect(parseByteSize(0)).toBeUndefined();
            expect(parseByteSize(-100)).toBeUndefined();
        });

        it('should parse string integers', () => {
            expect(parseByteSize('1024')).toBe(1024);
            expect(parseByteSize('18874368')).toBe(18874368);
            expect(parseByteSize('  5000  ')).toBe(5000);
        });

        it('should parse multiplication expressions', () => {
            expect(parseByteSize('18 * 1024 * 1024')).toBe(18874368);
            expect(parseByteSize('2 * 1024')).toBe(2048);
        });

        it('should parse human-readable unit strings', () => {
            expect(parseByteSize('25MB')).toBe(25 * 1024 * 1024);
            expect(parseByteSize('25M')).toBe(25 * 1024 * 1024);
            expect(parseByteSize('25mb')).toBe(25 * 1024 * 1024);
            expect(parseByteSize('10KB')).toBe(10 * 1024);
            expect(parseByteSize('10k')).toBe(10 * 1024);
            expect(parseByteSize('1GB')).toBe(1024 * 1024 * 1024);
            expect(parseByteSize('500B')).toBe(500);
            expect(parseByteSize('1.5MB')).toBe(Math.floor(1.5 * 1024 * 1024));
        });

        it('should return undefined for invalid strings', () => {
            expect(parseByteSize('')).toBeUndefined();
            expect(parseByteSize('abc')).toBeUndefined();
            expect(parseByteSize('MB')).toBeUndefined();
            expect(parseByteSize(null)).toBeUndefined();
            expect(parseByteSize(undefined)).toBeUndefined();
        });
    });

    describe('resolveFileAttachmentConfig', () => {
        const manifestConfig: FileAttachmentConfig = {
            enabled: true,
            maxFileSize: 18 * 1024 * 1024,
            maxCount: 10,
            allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        };

        it('should return manifest defaults when options are undefined or empty', () => {
            const resolved = resolveFileAttachmentConfig(manifestConfig, undefined);
            expect(resolved).toEqual(manifestConfig);

            const resolvedEmpty = resolveFileAttachmentConfig(manifestConfig, {});
            expect(resolvedEmpty).toEqual(manifestConfig);
        });

        it('should override with uppercase env-style options', () => {
            const options = {
                ATTACHMENT_MAX_FILE_SIZE: '25MB',
                ATTACHMENT_MAX_COUNT: '20',
                ATTACHMENT_ALLOWED_MIME_TYPES: 'application/pdf, image/*',
            };

            const resolved = resolveFileAttachmentConfig(manifestConfig, options);
            expect(resolved?.enabled).toBe(true);
            expect(resolved?.maxFileSize).toBe(25 * 1024 * 1024);
            expect(resolved?.maxCount).toBe(20);
            expect(resolved?.allowedMimeTypes).toEqual(['application/pdf', 'image/*']);
        });

        it('should override with nested options.fileAttachment', () => {
            const options = {
                fileAttachment: {
                    maxFileSize: 50 * 1024 * 1024,
                    maxCount: 25,
                },
            };

            const resolved = resolveFileAttachmentConfig(manifestConfig, options);
            expect(resolved?.maxFileSize).toBe(50 * 1024 * 1024);
            expect(resolved?.maxCount).toBe(25);
            // Non-overridden fields retain manifest defaults
            expect(resolved?.allowedMimeTypes).toEqual(manifestConfig.allowedMimeTypes);
            expect(resolved?.enabled).toBe(true);
        });

        it('should handle enabled toggle string and boolean', () => {
            const disabled = resolveFileAttachmentConfig(manifestConfig, { ATTACHMENT_ENABLED: 'false' });
            expect(disabled?.enabled).toBe(false);

            const enabled = resolveFileAttachmentConfig({ enabled: false }, { ATTACHMENT_ENABLED: true });
            expect(enabled?.enabled).toBe(true);
        });
    });

    describe('createFileAttachmentArraySchema MIME and size enforcement', () => {
        it('should accept attachments matching exact allowed MIME types', () => {
            const schema = createFileAttachmentArraySchema({
                enabled: true,
                allowedMimeTypes: ['application/pdf', 'image/png'],
            });

            const result = schema.safeParse([
                { id: '1', filename: 'file.pdf', mime_type: 'application/pdf', size: 1024, hash: 'hash1' },
            ]);
            expect(result.success).toBe(true);
        });

        it('should accept attachments matching wildcard patterns like image/* and */*', () => {
            const wildcardSchema = createFileAttachmentArraySchema({
                enabled: true,
                allowedMimeTypes: ['image/*'],
            });

            expect(wildcardSchema.safeParse([
                { id: '1', filename: 'pic.png', mime_type: 'image/png', size: 1024, hash: 'h1' },
            ]).success).toBe(true);

            expect(wildcardSchema.safeParse([
                { id: '2', filename: 'pic.jpeg', mime_type: 'image/jpeg', size: 1024, hash: 'h2' },
            ]).success).toBe(true);

            // Rejects non-image
            expect(wildcardSchema.safeParse([
                { id: '3', filename: 'doc.pdf', mime_type: 'application/pdf', size: 1024, hash: 'h3' },
            ]).success).toBe(false);

            const allWildcard = createFileAttachmentArraySchema({
                enabled: true,
                allowedMimeTypes: ['*/*'],
            });
            expect(allWildcard.safeParse([
                { id: '4', filename: 'any.xyz', mime_type: 'application/x-custom', size: 1024, hash: 'h4' },
            ]).success).toBe(true);
        });

        it('should reject attachments with disallowed MIME types', () => {
            const schema = createFileAttachmentArraySchema({
                enabled: true,
                allowedMimeTypes: ['application/pdf'],
            });

            const result = schema.safeParse([
                { id: '1', filename: 'script.exe', mime_type: 'application/x-msdownload', size: 500, hash: 'h1' },
            ]);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain('restrictions');
            }
        });

        it('should reject attachments exceeding maxFileSize', () => {
            const schema = createFileAttachmentArraySchema({
                enabled: true,
                maxFileSize: 1024, // 1 KB
                allowedMimeTypes: ['application/pdf'],
            });

            const oversized = schema.safeParse([
                { id: '1', filename: 'big.pdf', mime_type: 'application/pdf', size: 2048, hash: 'h1' },
            ]);
            expect(oversized.success).toBe(false);

            const valid = schema.safeParse([
                { id: '2', filename: 'small.pdf', mime_type: 'application/pdf', size: 512, hash: 'h2' },
            ]);
            expect(valid.success).toBe(true);
        });

        it('should reject attachments exceeding maxCount', () => {
            const schema = createFileAttachmentArraySchema({
                enabled: true,
                maxCount: 2,
            });

            const valid = schema.safeParse([
                { id: '1', filename: 'f1.pdf', mime_type: 'application/pdf', size: 100, hash: 'h1' },
                { id: '2', filename: 'f2.pdf', mime_type: 'application/pdf', size: 100, hash: 'h2' },
            ]);
            expect(valid.success).toBe(true);

            const exceeded = schema.safeParse([
                { id: '1', filename: 'f1.pdf', mime_type: 'application/pdf', size: 100, hash: 'h1' },
                { id: '2', filename: 'f2.pdf', mime_type: 'application/pdf', size: 100, hash: 'h2' },
                { id: '3', filename: 'f3.pdf', mime_type: 'application/pdf', size: 100, hash: 'h3' },
            ]);
            expect(exceeded.success).toBe(false);
        });
    });

    describe('PluginRegistry effective metadata integration', () => {
        beforeEach(() => {
            PluginRegistry.clear();
        });

        const manifest: ProviderManifest = {
            name: 'test-email-plugin',
            version: '1.0.0',
            channel: 'email',
            displayName: 'Test Email Provider',
            description: 'Test provider description',
            requiredCredentials: ['API_KEY'],
            optionalConfig: ['ATTACHMENT_MAX_FILE_SIZE', 'ATTACHMENT_MAX_COUNT'],
            fileAttachment: {
                enabled: true,
                maxFileSize: 18 * 1024 * 1024,
                maxCount: 10,
                allowedMimeTypes: ['application/pdf'],
            },
        };

        const createMockProvider = (effectiveConfig?: FileAttachmentConfig): SimpleNSProvider => ({
            manifest,
            getNotificationSchema: () => z.object({}) as any,
            getRecipientSchema: () => z.object({ email: z.string().email() }),
            getContentSchema: () => z.object({
                subject: z.string(),
                attachments: createFileAttachmentArraySchema(effectiveConfig ?? manifest.fileAttachment).optional(),
            }),
            getRateLimitConfig: () => ({ maxTokens: 100, refillRate: 10 }),
            getFileAttachmentConfig: effectiveConfig ? () => effectiveConfig : undefined,
            initialize: async () => {},
            healthCheck: async () => true,
            send: async () => ({ success: true }),
            shutdown: async () => {},
        });

        it('should return manifest defaults when no options or custom getter exist', () => {
            const provider = createMockProvider();
            PluginRegistry.register(provider, 'provider-default', 10);

            const metadata = PluginRegistry.getPluginMetadata();
            const providerMeta = metadata.channels.email.providers[0];
            const attachmentField = providerMeta.contentFields.find((f: FieldDefinition) => f.name === 'attachments');

            expect(attachmentField?.attachmentConfig?.maxFileSize).toBe(18 * 1024 * 1024);
            expect(attachmentField?.attachmentConfig?.maxCount).toBe(10);
        });

        it('should return overridden limits from getFileAttachmentConfig()', () => {
            const customConfig: FileAttachmentConfig = {
                enabled: true,
                maxFileSize: 30 * 1024 * 1024,
                maxCount: 20,
                allowedMimeTypes: ['application/pdf', 'image/*'],
            };
            const provider = createMockProvider(customConfig);
            PluginRegistry.register(provider, 'provider-custom', 10);

            const metadata = PluginRegistry.getPluginMetadata();
            const providerMeta = metadata.channels.email.providers[0];
            const attachmentField = providerMeta.contentFields.find((f: FieldDefinition) => f.name === 'attachments');

            expect(attachmentField?.attachmentConfig?.maxFileSize).toBe(30 * 1024 * 1024);
            expect(attachmentField?.attachmentConfig?.maxCount).toBe(20);
            expect(attachmentField?.attachmentConfig?.allowedMimeTypes).toEqual(['application/pdf', 'image/*']);
        });

        it('should resolve limits from registered options when provider does not implement getFileAttachmentConfig', () => {
            const provider = createMockProvider();
            PluginRegistry.register(provider, 'provider-with-options', 10, {
                ATTACHMENT_MAX_FILE_SIZE: '25MB',
                ATTACHMENT_MAX_COUNT: 15,
            });

            const metadata = PluginRegistry.getPluginMetadata();
            const providerMeta = metadata.channels.email.providers[0];
            const attachmentField = providerMeta.contentFields.find((f: FieldDefinition) => f.name === 'attachments');

            expect(attachmentField?.attachmentConfig?.maxFileSize).toBe(25 * 1024 * 1024);
            expect(attachmentField?.attachmentConfig?.maxCount).toBe(15);
        });
    });
});
