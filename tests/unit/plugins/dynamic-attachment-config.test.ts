import { describe, it, expect, beforeEach } from 'vitest';
import { parseByteSize, resolveFileAttachmentConfig, createFileAttachmentArraySchema } from '@src/types/schemas.js';
import { PluginRegistry } from '@src/plugins/loader/registry.js';
import type { SimpleNSProvider, ProviderManifest, FileAttachmentConfig } from '@src/types/types.js';
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
            const attachmentField = providerMeta.contentFields.find(f => f.name === 'attachments');

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
            const attachmentField = providerMeta.contentFields.find(f => f.name === 'attachments');

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
            const attachmentField = providerMeta.contentFields.find(f => f.name === 'attachments');

            expect(attachmentField?.attachmentConfig?.maxFileSize).toBe(25 * 1024 * 1024);
            expect(attachmentField?.attachmentConfig?.maxCount).toBe(15);
        });
    });
});
