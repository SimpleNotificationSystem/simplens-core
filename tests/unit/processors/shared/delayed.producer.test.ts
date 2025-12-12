/**
 * Unit tests for delayed.producer.ts
 * Tests delayed notification producer functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockEmailNotification, createMockWhatsappNotification } from '../../../utils/mocks';

// Mock Kafka producer
const mockSend = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

const mockProducer = {
    send: mockSend,
    connect: mockConnect,
    disconnect: mockDisconnect,
};

vi.mock('@src/config/kafka.config.js', () => ({
    kafka: {
        producer: vi.fn(() => mockProducer),
    },
}));

// Mock logger (not used directly but may be imported)
vi.mock('@src/workers/utils/logger.js', () => ({
    delayedWorkerLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe('Delayed Producer', () => {
    let delayedProducer: typeof import('../../../../src/processors/shared/delayed.producer.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        delayedProducer = await import('../../../../src/processors/shared/delayed.producer.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('initDelayedProducer', () => {
        it('should initialize producer and connect', async () => {
            await delayedProducer.initDelayedProducer();

            expect(mockConnect).toHaveBeenCalled();
        });

        it('should be idempotent - only initialize once', async () => {
            await delayedProducer.initDelayedProducer();
            await delayedProducer.initDelayedProducer();

            expect(mockConnect).toHaveBeenCalledTimes(1);
        });
    });

    describe('buildDelayedPayloadFromEmail', () => {
        it('should build delayed payload with quadratic backoff', () => {
            const notification = createMockEmailNotification();
            const retryCount = 2;

            const result = delayedProducer.buildDelayedPayloadFromEmail(notification, retryCount);

            expect(result.notification_id).toBe(notification.notification_id);
            expect(result.request_id).toBe(notification.request_id);
            expect(result.client_id).toBe(notification.client_id);
            expect(result.target_topic).toBe('email_notification');
            expect(result.payload.retry_count).toBe(retryCount);
        });

        it('should calculate scheduled_at with quadratic delay', () => {
            const notification = createMockEmailNotification();
            const retryCount = 3; // delay = 3^2 = 9 seconds

            const beforeTime = Date.now();
            const result = delayedProducer.buildDelayedPayloadFromEmail(notification, retryCount);
            const afterTime = Date.now();

            const scheduledTime = new Date(result.scheduled_at).getTime();

            // Should be about 9 seconds in the future
            expect(scheduledTime).toBeGreaterThanOrEqual(beforeTime + 9000);
            expect(scheduledTime).toBeLessThanOrEqual(afterTime + 9000);
        });

        it('should include created_at timestamp', () => {
            const notification = createMockEmailNotification();

            const result = delayedProducer.buildDelayedPayloadFromEmail(notification, 1);

            expect(result.created_at).toBeDefined();
        });
    });

    describe('buildDelayedPayloadFromWhatsapp', () => {
        it('should build delayed payload for WhatsApp', () => {
            const notification = createMockWhatsappNotification();
            const retryCount = 2;

            const result = delayedProducer.buildDelayedPayloadFromWhatsapp(notification, retryCount);

            expect(result.notification_id).toBe(notification.notification_id);
            expect(result.target_topic).toBe('whatsapp_notification');
            expect(result.payload.retry_count).toBe(retryCount);
        });

        it('should calculate backoff correctly for retry 1', () => {
            const notification = createMockWhatsappNotification();
            const retryCount = 1; // delay = 1^2 = 1 second

            const beforeTime = Date.now();
            const result = delayedProducer.buildDelayedPayloadFromWhatsapp(notification, retryCount);

            const scheduledTime = new Date(result.scheduled_at).getTime();
            expect(scheduledTime).toBeGreaterThanOrEqual(beforeTime + 1000);
        });
    });

    describe('publishDelayed', () => {
        it('should throw error if producer not initialized', async () => {
            const payload = delayedProducer.buildDelayedPayloadFromEmail(
                createMockEmailNotification(),
                1
            );

            await expect(delayedProducer.publishDelayed(payload)).rejects.toThrow(
                'Delayed producer not initialized'
            );
        });

        it('should send message to delayed_notification topic', async () => {
            await delayedProducer.initDelayedProducer();

            const payload = delayedProducer.buildDelayedPayloadFromEmail(
                createMockEmailNotification(),
                1
            );

            await delayedProducer.publishDelayed(payload);

            expect(mockSend).toHaveBeenCalledWith({
                topic: 'delayed_notification',
                messages: [
                    {
                        key: payload.notification_id.toString(),
                        value: JSON.stringify(payload),
                    },
                ],
                acks: -1,
                timeout: 30000,
            });
        });
    });

    describe('disconnectDelayedProducer', () => {
        it('should disconnect producer when initialized', async () => {
            await delayedProducer.initDelayedProducer();

            await delayedProducer.disconnectDelayedProducer();

            expect(mockDisconnect).toHaveBeenCalled();
        });

        it('should be safe to call when not initialized', async () => {
            // Should not throw
            await expect(delayedProducer.disconnectDelayedProducer()).resolves.not.toThrow();
        });
    });
});
