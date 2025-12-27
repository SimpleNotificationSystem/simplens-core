/**
 * Unit Tests for Plugin Registry
 * Tests provider registration, lookup, and channel management
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

// Create a mock provider factory
function createMockProvider(options: {
    name: string;
    channel: string;
    rateLimit?: { maxTokens: number; refillRate: number };
}) {
    const recipientSchema = z.object({
        user_id: z.string(),
        email: z.email().optional(),
    });

    const contentSchema = z.object({
        message: z.string(),
    });

    return {
        manifest: {
            name: options.name,
            displayName: options.name,
            channel: options.channel,
            version: '1.0.0',
        },
        send: vi.fn().mockResolvedValue({ success: true }),
        getNotificationSchema: vi.fn().mockReturnValue(
            z.object({
                notification_id: z.string(),
                request_id: z.string(),
                client_id: z.string(),
                channel: z.string(),
                recipient: recipientSchema,
                content: contentSchema,
                webhook_url: z.string().url(),
                retry_count: z.number(),
                created_at: z.date(),
            })
        ),
        getRecipientSchema: vi.fn().mockReturnValue(recipientSchema),
        getContentSchema: vi.fn().mockReturnValue(contentSchema),
        getRateLimitConfig: vi.fn().mockReturnValue(options.rateLimit || { maxTokens: 100, refillRate: 10 }),
        shutdown: vi.fn().mockResolvedValue(undefined),
    };
}

describe('Plugin Registry', () => {
    let PluginRegistry: typeof import('../../../src/plugins/loader/registry.js').PluginRegistry;

    beforeEach(async () => {
        // Re-import to get fresh registry
        vi.resetModules();
        const module = await import('../../../src/plugins/loader/registry.js');
        PluginRegistry = module.PluginRegistry;
        PluginRegistry.clear();
    });

    describe('register', () => {
        it('should register a provider with ID and priority', () => {
            const mockProvider = createMockProvider({ name: 'gmail', channel: 'email' });

            PluginRegistry.register(mockProvider as any, 'gmail', 1);

            expect(PluginRegistry.has('gmail')).toBe(true);
            expect(PluginRegistry.get('gmail')).toBeDefined();
        });

        it('should register multiple providers for same channel', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            const sendgrid = createMockProvider({ name: 'sendgrid', channel: 'email' });

            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.register(sendgrid as any, 'sendgrid', 2);

            const providers = PluginRegistry.getProvidersForChannel('email');
            expect(providers).toHaveLength(2);
        });

        it('should order providers by priority (higher first)', () => {
            const lowPriority = createMockProvider({ name: 'low', channel: 'email' });
            const highPriority = createMockProvider({ name: 'high', channel: 'email' });

            PluginRegistry.register(lowPriority as any, 'low', 1);
            PluginRegistry.register(highPriority as any, 'high', 10);

            const providers = PluginRegistry.getProvidersForChannel('email');
            expect(providers[0].manifest.name).toBe('high');
        });
    });

    describe('get', () => {
        it('should return provider by ID', () => {
            const mockProvider = createMockProvider({ name: 'gmail', channel: 'email' });
            PluginRegistry.register(mockProvider as any, 'gmail', 1);

            const provider = PluginRegistry.get('gmail');

            expect(provider).toBeDefined();
            expect(provider?.manifest.name).toBe('gmail');
        });

        it('should return undefined for unknown provider', () => {
            const provider = PluginRegistry.get('unknown');
            expect(provider).toBeUndefined();
        });
    });

    describe('getOrThrow', () => {
        it('should return provider by ID', () => {
            const mockProvider = createMockProvider({ name: 'gmail', channel: 'email' });
            PluginRegistry.register(mockProvider as any, 'gmail', 1);

            const provider = PluginRegistry.getOrThrow('gmail');

            expect(provider.manifest.name).toBe('gmail');
        });

        it('should throw error for unknown provider', () => {
            expect(() => PluginRegistry.getOrThrow('unknown')).toThrow("Provider 'unknown' not found");
        });
    });

    describe('getDefaultProvider', () => {
        it('should return configured default provider', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            const sendgrid = createMockProvider({ name: 'sendgrid', channel: 'email' });

            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.register(sendgrid as any, 'sendgrid', 2);
            PluginRegistry.setChannelConfig('email', { default: 'sendgrid' });

            const defaultProvider = PluginRegistry.getDefaultProvider('email');

            expect(defaultProvider?.manifest.name).toBe('sendgrid');
        });

        it('should return highest priority provider if no default configured', () => {
            const low = createMockProvider({ name: 'low', channel: 'email' });
            const high = createMockProvider({ name: 'high', channel: 'email' });

            PluginRegistry.register(low as any, 'low', 1);
            PluginRegistry.register(high as any, 'high', 10);

            const defaultProvider = PluginRegistry.getDefaultProvider('email');

            expect(defaultProvider?.manifest.name).toBe('high');
        });

        it('should return undefined for unknown channel', () => {
            const provider = PluginRegistry.getDefaultProvider('unknown');
            expect(provider).toBeUndefined();
        });
    });

    describe('getDefaultProviderId', () => {
        it('should return configured default provider ID', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.setChannelConfig('email', { default: 'gmail' });

            const defaultId = PluginRegistry.getDefaultProviderId('email');

            expect(defaultId).toBe('gmail');
        });

        it('should return undefined for unknown channel', () => {
            const defaultId = PluginRegistry.getDefaultProviderId('unknown');
            expect(defaultId).toBeUndefined();
        });
    });

    describe('getFallbackProvider', () => {
        it('should return configured fallback provider', () => {
            const primary = createMockProvider({ name: 'primary', channel: 'email' });
            const fallback = createMockProvider({ name: 'fallback', channel: 'email' });

            PluginRegistry.register(primary as any, 'primary', 2);
            PluginRegistry.register(fallback as any, 'fallback', 1);
            PluginRegistry.setChannelConfig('email', { default: 'primary', fallback: 'fallback' });

            const fallbackProvider = PluginRegistry.getFallbackProvider('email');

            expect(fallbackProvider?.manifest.name).toBe('fallback');
        });

        it('should return undefined if no fallback configured', () => {
            const primary = createMockProvider({ name: 'primary', channel: 'email' });
            PluginRegistry.register(primary as any, 'primary', 1);

            const fallbackProvider = PluginRegistry.getFallbackProvider('email');

            expect(fallbackProvider).toBeUndefined();
        });
    });

    describe('getProviderIds', () => {
        it('should return all registered provider IDs', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            const twilio = createMockProvider({ name: 'twilio', channel: 'sms' });

            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.register(twilio as any, 'twilio', 1);

            const ids = PluginRegistry.getProviderIds();

            expect(ids).toContain('gmail');
            expect(ids).toContain('twilio');
        });
    });

    describe('getChannels', () => {
        it('should return all channels with providers', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            const twilio = createMockProvider({ name: 'twilio', channel: 'sms' });

            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.register(twilio as any, 'twilio', 1);

            const channels = PluginRegistry.getChannels();

            expect(channels).toContain('email');
            expect(channels).toContain('sms');
        });
    });

    describe('hasChannel', () => {
        it('should return true for channel with providers', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            PluginRegistry.register(gmail as any, 'gmail', 1);

            expect(PluginRegistry.hasChannel('email')).toBe(true);
        });

        it('should return false for unknown channel', () => {
            expect(PluginRegistry.hasChannel('unknown')).toBe(false);
        });
    });

    describe('shutdownAll', () => {
        it('should call shutdown on all providers', async () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            const twilio = createMockProvider({ name: 'twilio', channel: 'sms' });

            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.register(twilio as any, 'twilio', 1);

            await PluginRegistry.shutdownAll();

            expect(gmail.shutdown).toHaveBeenCalled();
            expect(twilio.shutdown).toHaveBeenCalled();
        });
    });

    describe('clear', () => {
        it('should remove all providers', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            PluginRegistry.register(gmail as any, 'gmail', 1);

            PluginRegistry.clear();

            expect(PluginRegistry.getProviderIds()).toHaveLength(0);
            expect(PluginRegistry.getChannels()).toHaveLength(0);
        });
    });

    describe('isInitialized', () => {
        it('should return false by default', () => {
            expect(PluginRegistry.isInitialized()).toBe(false);
        });

        it('should return true after setInitialized(true)', () => {
            PluginRegistry.setInitialized(true);
            expect(PluginRegistry.isInitialized()).toBe(true);
        });
    });

    describe('getManifests', () => {
        it('should return manifests for all providers', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            const twilio = createMockProvider({ name: 'twilio', channel: 'sms' });

            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.register(twilio as any, 'twilio', 1);

            const manifests = PluginRegistry.getManifests();

            expect(manifests).toHaveLength(2);
            expect(manifests.map(m => m.name)).toContain('gmail');
            expect(manifests.map(m => m.name)).toContain('twilio');
        });
    });

    describe('getPluginMetadata', () => {
        it('should return metadata grouped by channel', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            const sendgrid = createMockProvider({ name: 'sendgrid', channel: 'email' });

            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.register(sendgrid as any, 'sendgrid', 2);
            PluginRegistry.setChannelConfig('email', { default: 'gmail' });

            const metadata = PluginRegistry.getPluginMetadata();

            expect(metadata.channels.email).toBeDefined();
            expect(metadata.channels.email.providers).toHaveLength(2);
            expect(metadata.channels.email.default).toBe('gmail');
        });

        it('should extract field types correctly from Zod schemas', () => {
            // Create provider with various field types to exercise the extraction code
            const recipientSchema = z.object({
                user_id: z.string(),
                email: z.string().email(),
                phone_number: z.string(),
                count: z.number(),
                active: z.boolean(),
                optional_field: z.string().optional(),
            });

            const contentSchema = z.object({
                message: z.string(),
                body: z.string(),
            });

            const provider = {
                manifest: {
                    name: 'test-provider',
                    displayName: 'Test Provider',
                    channel: 'test',
                    version: '1.0.0',
                },
                send: vi.fn().mockResolvedValue({ success: true }),
                getNotificationSchema: vi.fn().mockReturnValue(z.object({})),
                getRecipientSchema: vi.fn().mockReturnValue(recipientSchema),
                getContentSchema: vi.fn().mockReturnValue(contentSchema),
                getRateLimitConfig: vi.fn().mockReturnValue({ maxTokens: 100, refillRate: 10 }),
                shutdown: vi.fn().mockResolvedValue(undefined),
            };

            PluginRegistry.register(provider as any, 'test-provider', 1);

            const metadata = PluginRegistry.getPluginMetadata();
            const recipientFields = metadata.channels.test.providers[0].recipientFields;
            const contentFields = metadata.channels.test.providers[0].contentFields;

            // Verify fields are extracted - exercises the extraction code paths
            expect(recipientFields).toHaveLength(6);
            expect(contentFields).toHaveLength(2);

            // Verify field names are extracted correctly
            const fieldNames = recipientFields.map(f => f.name);
            expect(fieldNames).toContain('user_id');
            expect(fieldNames).toContain('email');
            expect(fieldNames).toContain('count');
            expect(fieldNames).toContain('active');
            expect(fieldNames).toContain('optional_field');

            // All fields should have a type property
            recipientFields.forEach(field => {
                expect(field.type).toBeDefined();
            });

            // All fields should have a required property
            recipientFields.forEach(field => {
                expect(typeof field.required).toBe('boolean');
            });
        });

        it('should handle schema without shape property', () => {
            // Create provider with empty/minimal schema
            const provider = {
                manifest: {
                    name: 'minimal-provider',
                    displayName: 'Minimal Provider',
                    channel: 'minimal',
                    version: '1.0.0',
                },
                send: vi.fn().mockResolvedValue({ success: true }),
                getNotificationSchema: vi.fn().mockReturnValue(z.object({})),
                getRecipientSchema: vi.fn().mockReturnValue({}), // No shape property
                getContentSchema: vi.fn().mockReturnValue({}), // No shape property
                getRateLimitConfig: vi.fn().mockReturnValue({ maxTokens: 100, refillRate: 10 }),
                shutdown: vi.fn().mockResolvedValue(undefined),
            };

            PluginRegistry.register(provider as any, 'minimal-provider', 1);

            const metadata = PluginRegistry.getPluginMetadata();
            expect(metadata.channels.minimal.providers[0].recipientFields).toHaveLength(0);
            expect(metadata.channels.minimal.providers[0].contentFields).toHaveLength(0);
        });
    });

    describe('register edge cases', () => {
        it('should throw error when registering duplicate provider ID', () => {
            const gmail1 = createMockProvider({ name: 'gmail', channel: 'email' });
            const gmail2 = createMockProvider({ name: 'gmail', channel: 'email' });

            PluginRegistry.register(gmail1 as any, 'gmail', 1);

            expect(() => PluginRegistry.register(gmail2 as any, 'gmail', 1))
                .toThrow("Provider 'gmail' is already registered");
        });
    });

    describe('shutdownAll edge cases', () => {
        it('should handle shutdown errors gracefully', async () => {
            const errorProvider = {
                manifest: {
                    name: 'error-provider',
                    displayName: 'Error Provider',
                    channel: 'error',
                    version: '1.0.0',
                },
                send: vi.fn().mockResolvedValue({ success: true }),
                getNotificationSchema: vi.fn().mockReturnValue(z.object({})),
                getRecipientSchema: vi.fn().mockReturnValue(z.object({})),
                getContentSchema: vi.fn().mockReturnValue(z.object({})),
                getRateLimitConfig: vi.fn().mockReturnValue({ maxTokens: 100, refillRate: 10 }),
                shutdown: vi.fn().mockRejectedValue(new Error('Shutdown failed')),
            };

            const goodProvider = createMockProvider({ name: 'good', channel: 'good' });

            PluginRegistry.register(errorProvider as any, 'error-provider', 1);
            PluginRegistry.register(goodProvider as any, 'good-provider', 1);

            // Should not throw even if one provider fails to shutdown
            await expect(PluginRegistry.shutdownAll()).resolves.toBeUndefined();

            // Both shutdown methods should have been called
            expect(errorProvider.shutdown).toHaveBeenCalled();
            expect(goodProvider.shutdown).toHaveBeenCalled();

            // Registry should be cleared even after errors
            expect(PluginRegistry.getProviderIds()).toHaveLength(0);
        });
    });
});
