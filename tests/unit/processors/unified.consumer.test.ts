import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendAlertMock = vi.fn().mockResolvedValue(undefined);
const setFailedMock = vi.fn().mockResolvedValue(undefined);
const setDeliveredMock = vi.fn().mockResolvedValue(undefined);
const setRateLimitedMock = vi.fn().mockResolvedValue(undefined);
const tryAcquireProcessingLockMock = vi.fn();
const buildDelayedPayloadGenericMock = vi.fn();
const publishDelayedMock = vi.fn().mockResolvedValue(undefined);
const publishStatusMock = vi.fn().mockResolvedValue(undefined);
const consumeTokenMock = vi.fn();
const resolveFallbackProviderIdMock = vi.fn();
const getProviderCascadeMock = vi.fn();
const validateNotificationForProviderMock = vi.fn();
const sendWithFallbackMock = vi.fn();

const providerSafeParseMock = vi.fn();
const providerGetNotificationSchemaMock = vi.fn(() => ({
    safeParse: providerSafeParseMock,
}));
const pluginRegistryGetMock = vi.fn();
const pluginRegistryGetDefaultProviderIdMock = vi.fn();

let eachMessageHandler: ((payload: {
    topic: string;
    partition: number;
    message: { value: Buffer | null; offset: string };
}) => Promise<void>) | undefined;

const commitOffsetsMock = vi.fn().mockResolvedValue(undefined);
const kafkaConsumerMock = {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockImplementation(async ({ eachMessage }) => {
        eachMessageHandler = eachMessage;
    }),
    commitOffsets: commitOffsetsMock,
    stop: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    events: {
        CRASH: 'consumer.crash',
        HEARTBEAT: 'consumer.heartbeat',
        STOP: 'consumer.stop',
        DISCONNECT: 'consumer.disconnect',
        CONNECT: 'consumer.connect',
    },
};

const getActiveProviderMock = vi.fn().mockResolvedValue(null);
const downloadFileMock = vi.fn();

vi.mock('../../../src/storage/storage.service.js', () => ({
    StorageService: {
        getActiveProvider: getActiveProviderMock,
        downloadFile: downloadFileMock,
    },
}));

vi.mock('../../../src/config/kafka.config.js', () => ({
    kafka: {
        consumer: vi.fn(() => kafkaConsumerMock),
    },
    ensureChannelTopic: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/plugins/index.js', () => ({
    PluginRegistry: {
        get: pluginRegistryGetMock,
        getDefaultProviderId: pluginRegistryGetDefaultProviderIdMock,
    },
    sendWithFallback: sendWithFallbackMock,
    getProviderCascade: getProviderCascadeMock,
    resolveFallbackProviderId: resolveFallbackProviderIdMock,
    validateNotificationForProvider: validateNotificationForProviderMock,
}));

vi.mock('../../../src/admin-alerts/admin-alert.service.js', () => ({
    AdminAlertService: {
        sendAlert: sendAlertMock,
    },
}));

vi.mock('../../../src/processors/shared/idempotency.js', () => ({
    tryAcquireProcessingLock: tryAcquireProcessingLockMock,
    setDelivered: setDeliveredMock,
    setFailed: setFailedMock,
    setRateLimited: setRateLimitedMock,
}));

vi.mock('../../../src/processors/shared/delayed.producer.js', () => ({
    publishDelayed: publishDelayedMock,
    buildDelayedPayloadGeneric: buildDelayedPayloadGenericMock,
}));

vi.mock('../../../src/processors/shared/status.producer.js', () => ({
    publishStatus: publishStatusMock,
}));

vi.mock('../../../src/processors/shared/schema-failure-handler.js', () => ({
    handleSchemaValidationFailure: vi.fn(),
}));

vi.mock('../../../src/processors/shared/rate-limiter.js', () => ({
    consumeToken: consumeTokenMock,
}));

vi.mock('../../../src/workers/utils/logger.js', () => ({
    apiLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('../../../src/processors/unified/unified.logger.js', () => ({
    unifiedProcessorLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('../../../src/database/models/status-outbox.models.js', () => ({
    default: {
        create: vi.fn(),
    },
}));

describe('scheduleFallbackProviderHandoff', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        eachMessageHandler = undefined;

        providerSafeParseMock.mockImplementation((notification) => ({
            success: true,
            data: notification,
        }));
        pluginRegistryGetDefaultProviderIdMock.mockReturnValue('primary');
        pluginRegistryGetMock.mockReturnValue({
            getNotificationSchema: providerGetNotificationSchemaMock,
        });
        tryAcquireProcessingLockMock.mockResolvedValue({ canProcess: true, isRetry: false });
        consumeTokenMock.mockResolvedValue({ allowed: true });
        getProviderCascadeMock.mockImplementation((_channel: string, currentProviderId?: string) => {
            return currentProviderId ? [currentProviderId] : ['primary'];
        });
        sendWithFallbackMock.mockResolvedValue({ success: true, messageId: 'msg-1' });

        buildDelayedPayloadGenericMock.mockReturnValue({
            notification_id: 'notif-123',
            request_id: 'req-123',
            client_id: 'client-123',
            scheduled_at: new Date(),
            target_topic: 'email_notification',
            payload: {},
            created_at: new Date(),
        });
    });

    it('should republish to delayed queue with fallback provider and reset retry count', async () => {
        resolveFallbackProviderIdMock.mockReturnValue('fallback');
        validateNotificationForProviderMock.mockImplementation((_providerId, notification) => ({
            success: true,
            data: notification,
        }));

        const { scheduleFallbackProviderHandoff } = await import('../../../src/processors/unified/unified.consumer.js');
        const notification = {
            notification_id: 'notif-123',
            request_id: 'req-123',
            client_id: 'client-123',
            channel: 'email',
            provider: 'primary',
            recipient: { user_id: 'user-123' },
            content: { message: 'Hello' },
            webhook_url: 'https://webhook.example.com',
            retry_count: 5,
            created_at: new Date(),
        };

        const result = await scheduleFallbackProviderHandoff(
            'email',
            notification,
            'primary',
            'Rate limited'
        );

        expect(result).toBe(true);
        expect(validateNotificationForProviderMock).toHaveBeenCalledWith(
            'fallback',
            expect.objectContaining({ provider: 'fallback' })
        );
        expect(setFailedMock).toHaveBeenCalledWith('notif-123', 5);
        expect(buildDelayedPayloadGenericMock).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'fallback' }),
            'email',
            0
        );
        expect(publishDelayedMock).toHaveBeenCalledTimes(1);
        expect(sendAlertMock).toHaveBeenCalledTimes(1);
    });

    it('should return false when no fallback provider is available', async () => {
        resolveFallbackProviderIdMock.mockReturnValue(undefined);

        const { scheduleFallbackProviderHandoff } = await import('../../../src/processors/unified/unified.consumer.js');
        const notification = {
            notification_id: 'notif-123',
            request_id: 'req-123',
            client_id: 'client-123',
            channel: 'email',
            provider: 'primary',
            recipient: { user_id: 'user-123' },
            content: { message: 'Hello' },
            webhook_url: 'https://webhook.example.com',
            retry_count: 5,
            created_at: new Date(),
        };

        const result = await scheduleFallbackProviderHandoff(
            'email',
            notification,
            'primary',
            'Rate limited'
        );

        expect(result).toBe(false);
        expect(validateNotificationForProviderMock).not.toHaveBeenCalled();
        expect(publishDelayedMock).not.toHaveBeenCalled();
    });

    it('should return false when fallback validation fails', async () => {
        resolveFallbackProviderIdMock.mockReturnValue('fallback');
        validateNotificationForProviderMock.mockReturnValue({
            success: false,
            error: 'content.message: Required',
        });

        const { scheduleFallbackProviderHandoff } = await import('../../../src/processors/unified/unified.consumer.js');
        const notification = {
            notification_id: 'notif-123',
            request_id: 'req-123',
            client_id: 'client-123',
            channel: 'email',
            provider: 'primary',
            recipient: { user_id: 'user-123' },
            content: { message: 'Hello' },
            webhook_url: 'https://webhook.example.com',
            retry_count: 5,
            created_at: new Date(),
        };

        const result = await scheduleFallbackProviderHandoff(
            'email',
            notification,
            'primary',
            'Rate limited'
        );

        expect(result).toBe(false);
        expect(setFailedMock).not.toHaveBeenCalled();
        expect(publishDelayedMock).not.toHaveBeenCalled();
    });
});

describe('processMessage via consumer run loop', () => {
    const createNotification = (overrides: Record<string, unknown> = {}) => ({
        notification_id: 'notif-123',
        request_id: 'req-123',
        client_id: 'client-123',
        channel: 'email',
        provider: 'primary',
        recipient: { user_id: 'user-123' },
        content: { message: 'Hello' },
        webhook_url: 'https://webhook.example.com',
        retry_count: 0,
        created_at: new Date().toISOString(),
        ...overrides,
    });

    const startAndProcess = async (notification: Record<string, unknown>) => {
        const { startUnifiedConsumer, stopUnifiedConsumer } = await import('../../../src/processors/unified/unified.consumer.js');

        await startUnifiedConsumer('email');
        expect(eachMessageHandler).toBeDefined();

        await eachMessageHandler!({
            topic: 'email_notification',
            partition: 0,
            message: {
                value: Buffer.from(JSON.stringify(notification)),
                offset: '0',
            },
        });

        await stopUnifiedConsumer('email');
    };

    beforeEach(() => {
        vi.clearAllMocks();
        sendWithFallbackMock.mockResolvedValue({ success: true, messageId: 'msg-1' });
        consumeTokenMock.mockResolvedValue({ allowed: true });
        getProviderCascadeMock.mockImplementation((_channel: string, currentProviderId?: string) => {
            return currentProviderId ? [currentProviderId] : ['primary'];
        });
        resolveFallbackProviderIdMock.mockReturnValue(undefined);
        tryAcquireProcessingLockMock.mockResolvedValue({ canProcess: true, isRetry: false });
        providerSafeParseMock.mockImplementation((notification) => ({
            success: true,
            data: notification,
        }));
    });

    it('should set failed, publish failure status, and alert for non-retryable provider errors', async () => {
        sendWithFallbackMock.mockResolvedValue({
            success: false,
            error: {
                code: 'AUTH_FAILED',
                message: 'Invalid credentials',
                retryable: false,
            },
        });

        await startAndProcess(createNotification());

        expect(setFailedMock).toHaveBeenCalledWith('notif-123', 0);
        expect(publishStatusMock).toHaveBeenCalledWith(expect.objectContaining({
            notification_id: 'notif-123',
            status: 'failed',
            message: 'Invalid credentials',
        }));
        expect(sendAlertMock).toHaveBeenCalledWith(
            'failed_notification',
            expect.stringContaining('NON-RETRYABLE PROVIDER FAILURE'),
            expect.objectContaining({ severity: 'critical', notificationId: 'notif-123', channel: 'email' })
        );
        expect(commitOffsetsMock).toHaveBeenCalledTimes(1);
    });

    it('should cascade to fallback provider in real time when primary is rate-limited and deliver immediately', async () => {
        getProviderCascadeMock.mockReturnValue(['primary', 'fallback']);
        consumeTokenMock.mockImplementation(async (providerId) => {
            if (providerId === 'primary') {
                return { allowed: false, retryAfterMs: 5000 };
            }
            return { allowed: true, remainingTokens: 10 };
        });

        await startAndProcess(createNotification());

        expect(consumeTokenMock).toHaveBeenCalledWith('primary');
        expect(consumeTokenMock).toHaveBeenCalledWith('fallback');
        expect(sendWithFallbackMock).toHaveBeenCalledWith(
            'email',
            expect.objectContaining({ provider: 'fallback' })
        );
        expect(setDeliveredMock).toHaveBeenCalledWith('notif-123', 0);
        expect(publishStatusMock).toHaveBeenCalledWith(expect.objectContaining({
            notification_id: 'notif-123',
            status: 'delivered',
            provider: 'fallback',
            provider_history: expect.arrayContaining([
                expect.objectContaining({
                    provider: 'primary',
                    status: 'rate_limited',
                    error_code: 'RATE_LIMITED'
                })
            ])
        }));
        expect(commitOffsetsMock).toHaveBeenCalledTimes(1);
    });

    it('should push to delayed queue with fixed delay when all cascade providers are rate limited', async () => {
        getProviderCascadeMock.mockReturnValue(['primary', 'fallback']);
        consumeTokenMock.mockResolvedValue({ allowed: false, retryAfterMs: 5000 });

        await startAndProcess(createNotification({ retry_count: 0 }));

        expect(consumeTokenMock).toHaveBeenCalledWith('primary');
        expect(consumeTokenMock).toHaveBeenCalledWith('fallback');
        expect(setRateLimitedMock).toHaveBeenCalledWith('notif-123', 0);
        expect(buildDelayedPayloadGenericMock).toHaveBeenCalledWith(
            expect.anything(),
            'email',
            1,
            5000
        );
        expect(publishDelayedMock).toHaveBeenCalledTimes(1);
        expect(commitOffsetsMock).toHaveBeenCalledTimes(1);
    });

    it('should set failed when retry budget exceeded and all cascade providers are rate-limited', async () => {
        getProviderCascadeMock.mockReturnValue(['primary', 'fallback']);
        consumeTokenMock.mockResolvedValue({ allowed: false, retryAfterMs: 5000 });

        await startAndProcess(createNotification({ retry_count: Number.MAX_SAFE_INTEGER }));

        expect(setFailedMock).toHaveBeenCalledWith('notif-123', Number.MAX_SAFE_INTEGER);
        expect(publishStatusMock).toHaveBeenCalledWith(expect.objectContaining({
            notification_id: 'notif-123',
            status: 'failed',
            message: 'Max retry count exceeded (rate limiting)',
        }));
        expect(sendAlertMock).toHaveBeenCalledWith(
            'failed_notification',
            expect.stringContaining('MAX RETRIES EXCEEDED (RATE LIMITED)'),
            expect.objectContaining({ severity: 'critical', notificationId: 'notif-123', channel: 'email' })
        );
        expect(publishDelayedMock).not.toHaveBeenCalled();
        expect(commitOffsetsMock).toHaveBeenCalledTimes(1);
    });
});

describe('areUnifiedConsumersHealthy', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('should report healthy when in standby mode with no expected channels', async () => {
        const { areUnifiedConsumersHealthy } = await import('../../../src/processors/unified/unified.consumer.js');
        const result = areUnifiedConsumersHealthy([]);
        expect(result.healthy).toBe(true);
        expect(result.details).toEqual({});
    });

    it('should report unhealthy if expected channel has no consumer running', async () => {
        const { areUnifiedConsumersHealthy } = await import('../../../src/processors/unified/unified.consumer.js');
        const result = areUnifiedConsumersHealthy(['email']);
        expect(result.healthy).toBe(false);
        expect(result.details.email.running).toBe(false);
        expect(result.details.email.error).toContain('not initialized or missing');
    });

    it('should report healthy once consumer starts and receives heartbeat', async () => {
        const { startUnifiedConsumer, areUnifiedConsumersHealthy, stopAllConsumers } = await import('../../../src/processors/unified/unified.consumer.js');
        await startUnifiedConsumer('email');

        const result = areUnifiedConsumersHealthy(['email']);
        expect(result.healthy).toBe(true);
        expect(result.details.email.running).toBe(true);
        expect(result.details.email.crashed).toBe(false);

        await stopAllConsumers();
    });

    it('should report unhealthy if consumer has crashed', async () => {
        let crashListener: ((event: unknown) => void) | undefined;
        kafkaConsumerMock.on.mockImplementation((event: string, listener: (e: unknown) => void) => {
            if (event === 'consumer.crash') {
                crashListener = listener;
            }
        });

        const { startUnifiedConsumer, areUnifiedConsumersHealthy, stopAllConsumers } = await import('../../../src/processors/unified/unified.consumer.js');
        await startUnifiedConsumer('email');

        // Simulate Kafka consumer crash event
        if (crashListener) {
            crashListener({
                payload: {
                    error: new Error('Kafka broker connection lost'),
                    restart: false,
                }
            });
        }

        const result = areUnifiedConsumersHealthy(['email']);
        expect(result.healthy).toBe(false);
        expect(result.details.email.crashed).toBe(true);
        expect(result.details.email.error).toContain('Kafka broker connection lost');

        await stopAllConsumers();
    });
});

describe('File Attachments Resolution & Sanitization in Unified Consumer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should sanitize binary buffers and streams before delayed queueing', async () => {
        const { sanitizeNotificationForDelayedQueue } = await import('../../../src/processors/unified/unified.consumer.js');
        const raw = {
            notification_id: 'notif-1',
            channel: 'email',
            content: {
                subject: 'Test',
                attachments: [
                    {
                        id: 'file-123',
                        filename: 'report.pdf',
                        size: 1024,
                        mime_type: 'application/pdf',
                        hash: 'sha256-abc',
                        buffer: Buffer.from('hello-binary'),
                        stream: { readable: true },
                    },
                ],
            },
        };

        const sanitized = sanitizeNotificationForDelayedQueue(raw);
        const attachment = (sanitized.content as Record<string, unknown>).attachments as Array<Record<string, unknown>>;
        expect(attachment[0].id).toBe('file-123');
        expect(attachment[0].filename).toBe('report.pdf');
        expect(attachment[0].buffer).toBeUndefined();
        expect(attachment[0].stream).toBeUndefined();
    });

    it('should return success when resolving notification with no attachments', async () => {
        const { resolveNotificationAttachments } = await import('../../../src/processors/unified/unified.consumer.js');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await resolveNotificationAttachments({ content: { subject: 'hi' } } as any);
        expect(result.success).toBe(true);
    });

    it('should fail with NO_ACTIVE_STORAGE_PROVIDER if attachments exist but no active storage provider is available', async () => {
        const { resolveNotificationAttachments } = await import('../../../src/processors/unified/unified.consumer.js');
        getActiveProviderMock.mockResolvedValueOnce(null);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await resolveNotificationAttachments({
            content: {
                attachments: [{ id: 'file-123', filename: 'invoice.pdf' }],
            },
        } as any);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('NO_ACTIVE_STORAGE_PROVIDER');
        expect(result.error?.retryable).toBe(false);
    });

    it('should resolve and enrich attachments using active storage provider', async () => {
        const { resolveNotificationAttachments } = await import('../../../src/processors/unified/unified.consumer.js');
        const mockBuffer = Buffer.from('pdf-content');
        const mockStream = { readable: true };

        getActiveProviderMock.mockResolvedValueOnce({
            provider: {
                providerType: 'minio',
                getUrl: vi.fn().mockResolvedValue('https://storage.local/presigned-url'),
            },
            doc: { provider_type: 'minio' },
        });

        downloadFileMock.mockResolvedValueOnce({
            attachment: {
                file_id: 'file-123',
                filename: 'invoice.pdf',
                mime_type: 'application/pdf',
                size: 11,
                hash: 'sha256-dummy',
                storage_key: 'file-123',
            },
            download: {
                success: true,
                buffer: mockBuffer,
                stream: mockStream,
            },
        });

        const notification = {
            notification_id: 'notif-1',
            channel: 'email',
            content: {
                subject: 'Your Invoice',
                attachments: [
                    { id: 'file-123' },
                ],
            },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await resolveNotificationAttachments(notification as any);

        expect(result.success).toBe(true);
        const resolved = (notification.content.attachments as any[])[0];
        expect(resolved.buffer).toBe(mockBuffer);
        expect(resolved.stream).toBe(mockStream);
        expect(resolved.filename).toBe('invoice.pdf');
        expect(resolved.mime_type).toBe('application/pdf');
        expect(resolved.size).toBe(11);
        expect(resolved.hash).toBe('sha256-dummy');
        expect(resolved.url).toBe('https://storage.local/presigned-url');
    });

    it('should identify ATTACHMENT_NOT_FOUND as non-retryable error', async () => {
        const { resolveNotificationAttachments } = await import('../../../src/processors/unified/unified.consumer.js');
        getActiveProviderMock.mockResolvedValueOnce({
            provider: { providerType: 'minio' },
            doc: { provider_type: 'minio' },
        });

        downloadFileMock.mockRejectedValueOnce(new Error('File not found: file-unknown'));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await resolveNotificationAttachments({
            content: {
                attachments: [{ id: 'file-unknown', filename: 'missing.pdf' }],
            },
        } as any);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('ATTACHMENT_NOT_FOUND');
        expect(result.error?.retryable).toBe(false);
    });

    it('should identify download failure as retryable error on network/storage outage', async () => {
        const { resolveNotificationAttachments } = await import('../../../src/processors/unified/unified.consumer.js');
        getActiveProviderMock.mockResolvedValueOnce({
            provider: { providerType: 'minio' },
            doc: { provider_type: 'minio' },
        });

        downloadFileMock.mockRejectedValueOnce(new Error('MinIO connection refused'));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await resolveNotificationAttachments({
            content: {
                attachments: [{ id: 'file-123', filename: 'test.pdf' }],
            },
        } as any);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('ATTACHMENT_DOWNLOAD_FAILED');
        expect(result.error?.retryable).toBe(true);
    });
});
