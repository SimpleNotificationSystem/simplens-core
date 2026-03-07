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
};

vi.mock('../../../src/config/kafka.config.js', () => ({
    kafka: {
        consumer: vi.fn(() => kafkaConsumerMock),
    },
}));

vi.mock('../../../src/plugins/index.js', () => ({
    PluginRegistry: {
        get: pluginRegistryGetMock,
        getDefaultProviderId: pluginRegistryGetDefaultProviderIdMock,
    },
    sendWithFallback: sendWithFallbackMock,
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

    it('should hand off to fallback when rate-limit retry budget is exceeded', async () => {
        consumeTokenMock.mockResolvedValue({ allowed: false, retryAfterMs: 1000 });
        resolveFallbackProviderIdMock.mockReturnValue('fallback');
        validateNotificationForProviderMock.mockImplementation((_providerId, notification) => ({
            success: true,
            data: notification,
        }));

        await startAndProcess(createNotification({ retry_count: Number.MAX_SAFE_INTEGER }));

        expect(resolveFallbackProviderIdMock).toHaveBeenCalledWith('email', 'primary');
        expect(buildDelayedPayloadGenericMock).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'fallback' }),
            'email',
            0
        );
        expect(publishDelayedMock).toHaveBeenCalledTimes(1);
        expect(publishStatusMock).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
        expect(commitOffsetsMock).toHaveBeenCalledTimes(1);
    });

    it('should set failed when retry budget exceeded and current provider is fallback', async () => {
        consumeTokenMock.mockResolvedValue({ allowed: false, retryAfterMs: 1000 });
        resolveFallbackProviderIdMock.mockReturnValue(undefined);

        await startAndProcess(createNotification({ provider: 'fallback', retry_count: Number.MAX_SAFE_INTEGER }));

        expect(resolveFallbackProviderIdMock).toHaveBeenCalledWith('email', 'fallback');
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
