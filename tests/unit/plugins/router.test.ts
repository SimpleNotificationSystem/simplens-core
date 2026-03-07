/**
 * Unit Tests for Provider Router
 * Tests notification routing, fallback, and validation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

// Mock dependencies before importing the module
vi.mock('../../../src/admin-alerts/admin-alert.service.js', () => ({
    AdminAlertService: {
        sendAlert: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../../../src/processors/shared/schema-failure-handler.js', () => ({
    handleSchemaValidationFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/processors/unified/unified.logger.js', () => ({
    unifiedProcessorLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// Create a mock provider factory
function createMockProvider(options: {
    name: string;
    channel: string;
    sendResult?: { success: boolean; error?: { code: string; message: string; retryable: boolean } };
    rateLimit?: { maxTokens: number; refillRate: number };
}) {
    const defaultResult = { success: true };
    return {
        manifest: {
            name: options.name,
            displayName: options.name,
            channel: options.channel,
            version: '1.0.0',
        },
        send: vi.fn().mockResolvedValue(options.sendResult || defaultResult),
        getNotificationSchema: vi.fn().mockReturnValue(
            z.object({
                notification_id: z.string(),
                request_id: z.string(),
                client_id: z.string(),
                channel: z.literal(options.channel),
                provider: z.string().optional(),
                recipient: z.object({
                    user_id: z.string(),
                }),
                content: z.object({
                    message: z.string(),
                }),
                webhook_url: z.string().url(),
                retry_count: z.number(),
                created_at: z.coerce.date(),
            })
        ),
        getRateLimitConfig: vi.fn().mockReturnValue(options.rateLimit || { maxTokens: 100, refillRate: 10 }),
        shutdown: vi.fn().mockResolvedValue(undefined),
    };
}

describe('Provider Router', () => {
    let PluginRegistry: typeof import('../../../src/plugins/loader/registry.js').PluginRegistry;
    let sendWithFallback: typeof import('../../../src/plugins/loader/router.js').sendWithFallback;
    let sendToProvider: typeof import('../../../src/plugins/loader/router.js').sendToProvider;
    let validateNotification: typeof import('../../../src/plugins/loader/router.js').validateNotification;
    let validateNotificationForProvider: typeof import('../../../src/plugins/loader/router.js').validateNotificationForProvider;
    let resolveFallbackProviderId: typeof import('../../../src/plugins/loader/router.js').resolveFallbackProviderId;
    let getRateLimitConfig: typeof import('../../../src/plugins/loader/router.js').getRateLimitConfig;

    beforeEach(async () => {
        vi.resetModules();
        const registryModule = await import('../../../src/plugins/loader/registry.js');
        const routerModule = await import('../../../src/plugins/loader/router.js');

        PluginRegistry = registryModule.PluginRegistry;
        sendWithFallback = routerModule.sendWithFallback;
        sendToProvider = routerModule.sendToProvider;
        validateNotification = routerModule.validateNotification;
        validateNotificationForProvider = routerModule.validateNotificationForProvider;
        resolveFallbackProviderId = routerModule.resolveFallbackProviderId;
        getRateLimitConfig = routerModule.getRateLimitConfig;

        PluginRegistry.clear();
    });

    describe('sendWithFallback', () => {
        const createNotification = (channel: string, provider?: string) => ({
            notification_id: 'notif-123',
            request_id: 'req-123',
            client_id: 'client-123',
            channel,
            provider,
            recipient: { user_id: 'user-123' },
            content: { message: 'Hello' },
            webhook_url: 'https://webhook.example.com',
            retry_count: 0,
            created_at: new Date(),
        });

        it('should use explicit provider if specified', async () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            const sendgrid = createMockProvider({ name: 'sendgrid', channel: 'email' });

            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.register(sendgrid as any, 'sendgrid', 2);
            PluginRegistry.setChannelConfig('email', { default: 'sendgrid' });

            const result = await sendWithFallback('email', createNotification('email', 'gmail'));

            expect(result.success).toBe(true);
            expect(gmail.send).toHaveBeenCalled();
            expect(sendgrid.send).not.toHaveBeenCalled();
        });

        it('should use default provider if no explicit provider', async () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.setChannelConfig('email', { default: 'gmail' });

            const result = await sendWithFallback('email', createNotification('email'));

            expect(result.success).toBe(true);
            expect(gmail.send).toHaveBeenCalled();
        });

        it('should return error if no provider for channel', async () => {
            const result = await sendWithFallback('email', createNotification('email'));

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('NO_PROVIDER');
        });

        it('should try fallback on non-retryable error', async () => {
            const primary = createMockProvider({
                name: 'primary',
                channel: 'email',
                sendResult: {
                    success: false,
                    error: { code: 'AUTH_FAILED', message: 'Invalid credentials', retryable: false }
                }
            });
            const fallback = createMockProvider({ name: 'fallback', channel: 'email' });

            PluginRegistry.register(primary as any, 'primary', 2);
            PluginRegistry.register(fallback as any, 'fallback', 1);
            PluginRegistry.setChannelConfig('email', { default: 'primary', fallback: 'fallback' });

            const result = await sendWithFallback('email', createNotification('email'));

            expect(result.success).toBe(true);
            expect(primary.send).toHaveBeenCalled();
            expect(fallback.send).toHaveBeenCalled();
        });

        it('should NOT try fallback on retryable error', async () => {
            const primary = createMockProvider({
                name: 'primary',
                channel: 'email',
                sendResult: {
                    success: false,
                    error: { code: 'RATE_LIMIT', message: 'Rate limited', retryable: true }
                }
            });
            const fallback = createMockProvider({ name: 'fallback', channel: 'email' });

            PluginRegistry.register(primary as any, 'primary', 2);
            PluginRegistry.register(fallback as any, 'fallback', 1);
            PluginRegistry.setChannelConfig('email', { default: 'primary', fallback: 'fallback' });

            const result = await sendWithFallback('email', createNotification('email'));

            expect(result.success).toBe(false);
            expect(result.error?.retryable).toBe(true);
            expect(fallback.send).not.toHaveBeenCalled();
        });

        it('should return ALL_PROVIDERS_FAILED if both fail', async () => {
            const primary = createMockProvider({
                name: 'primary',
                channel: 'email',
                sendResult: {
                    success: false,
                    error: { code: 'FAILED', message: 'Primary failed', retryable: false }
                }
            });
            const fallback = createMockProvider({
                name: 'fallback',
                channel: 'email',
                sendResult: {
                    success: false,
                    error: { code: 'FAILED', message: 'Fallback failed', retryable: false }
                }
            });

            PluginRegistry.register(primary as any, 'primary', 2);
            PluginRegistry.register(fallback as any, 'fallback', 1);
            PluginRegistry.setChannelConfig('email', { default: 'primary', fallback: 'fallback' });

            const result = await sendWithFallback('email', createNotification('email'));

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('ALL_PROVIDERS_FAILED');
        });

        it('should return original error if default fails with non-retryable error and no fallback configured', async () => {
            const primary = createMockProvider({
                name: 'primary',
                channel: 'email',
                sendResult: {
                    success: false,
                    error: { code: 'AUTH_FAILED', message: 'Invalid credentials', retryable: false }
                }
            });

            PluginRegistry.register(primary as any, 'primary', 1);
            PluginRegistry.setChannelConfig('email', { default: 'primary' }); // No fallback

            const result = await sendWithFallback('email', createNotification('email'));

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('AUTH_FAILED');
            expect(result.error?.message).toBe('Invalid credentials');
        });
    });

    describe('sendToProvider', () => {
        it('should send to specific provider', async () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            PluginRegistry.register(gmail as any, 'gmail', 1);

            const notification = {
                notification_id: 'notif-123',
                request_id: 'req-123',
                client_id: 'client-123',
                channel: 'email',
                recipient: { user_id: 'user-123' },
                content: { message: 'Hello' },
                webhook_url: 'https://webhook.example.com',
                retry_count: 0,
                created_at: new Date(),
            };

            const result = await sendToProvider('gmail', notification);

            expect(result.success).toBe(true);
            expect(gmail.send).toHaveBeenCalledWith(notification);
        });

        it('should return error if provider not found', async () => {
            const notification = {
                notification_id: 'notif-123',
                request_id: 'req-123',
                client_id: 'client-123',
                channel: 'email',
                recipient: { user_id: 'user-123' },
                content: { message: 'Hello' },
                webhook_url: 'https://webhook.example.com',
                retry_count: 0,
                created_at: new Date(),
            };

            const result = await sendToProvider('unknown', notification);

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('PROVIDER_NOT_FOUND');
        });
    });

    describe('validateNotification', () => {
        it('should validate notification against provider schema', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.setChannelConfig('email', { default: 'gmail' });

            const notification = {
                notification_id: 'notif-123',
                request_id: 'req-123',
                client_id: 'client-123',
                channel: 'email',
                recipient: { user_id: 'user-123' },
                content: { message: 'Hello' },
                webhook_url: 'https://webhook.example.com',
                retry_count: 0,
                created_at: new Date(),
            };

            const result = validateNotification('email', notification);

            expect(result.success).toBe(true);
        });

        it('should return error for invalid notification', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            PluginRegistry.register(gmail as any, 'gmail', 1);
            PluginRegistry.setChannelConfig('email', { default: 'gmail' });

            const notification = {
                // Missing required fields
                notification_id: 'notif-123',
            };

            const result = validateNotification('email', notification);

            expect(result.success).toBe(false);
        });

        it('should return error if no provider for channel', () => {
            const result = validateNotification('unknown', {});

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('No provider for channel');
            }
        });
    });

    describe('validateNotificationForProvider', () => {
        it('should validate notification against a specific provider schema', () => {
            const gmail = createMockProvider({ name: 'gmail', channel: 'email' });
            PluginRegistry.register(gmail as any, 'gmail', 1);

            const notification = {
                notification_id: 'notif-123',
                request_id: 'req-123',
                client_id: 'client-123',
                channel: 'email',
                provider: 'gmail',
                recipient: { user_id: 'user-123' },
                content: { message: 'Hello' },
                webhook_url: 'https://webhook.example.com',
                retry_count: 0,
                created_at: new Date(),
            };

            const result = validateNotificationForProvider('gmail', notification);

            expect(result.success).toBe(true);
        });

        it('should return an error if provider is not found', () => {
            const result = validateNotificationForProvider('missing-provider', {});

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain("Provider 'missing-provider' not found");
            }
        });
    });

    describe('resolveFallbackProviderId', () => {
        it('should resolve fallback provider when it differs from the current provider', () => {
            const primary = createMockProvider({ name: 'primary', channel: 'email' });
            const fallback = createMockProvider({ name: 'fallback', channel: 'email' });

            PluginRegistry.register(primary as any, 'primary', 2);
            PluginRegistry.register(fallback as any, 'fallback', 1);
            PluginRegistry.setChannelConfig('email', { default: 'primary', fallback: 'fallback' });

            expect(resolveFallbackProviderId('email', 'primary')).toBe('fallback');
        });

        it('should return undefined when current provider is already the fallback provider', () => {
            const primary = createMockProvider({ name: 'primary', channel: 'email' });
            const fallback = createMockProvider({ name: 'fallback', channel: 'email' });

            PluginRegistry.register(primary as any, 'primary', 2);
            PluginRegistry.register(fallback as any, 'fallback', 1);
            PluginRegistry.setChannelConfig('email', { default: 'primary', fallback: 'fallback' });

            expect(resolveFallbackProviderId('email', 'fallback')).toBeUndefined();
        });
    });

    describe('getRateLimitConfig', () => {
        it('should return rate limit config for provider', () => {
            const gmail = createMockProvider({
                name: 'gmail',
                channel: 'email',
                rateLimit: { maxTokens: 50, refillRate: 5 }
            });
            PluginRegistry.register(gmail as any, 'gmail', 1);

            const config = getRateLimitConfig('gmail');

            expect(config).toEqual({ maxTokens: 50, refillRate: 5 });
        });

        it('should return undefined for unknown provider', () => {
            const config = getRateLimitConfig('unknown');

            expect(config).toBeUndefined();
        });
    });
});
