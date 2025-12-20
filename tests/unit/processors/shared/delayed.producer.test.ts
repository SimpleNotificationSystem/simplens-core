/**
 * Unit tests for delayed.producer.ts
 * Tests delayed notification producer functionality
 * 
 * Updated for plugin-based architecture - uses buildDelayedPayload.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockBaseNotification } from '../../../utils/mocks.js';

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

    describe('buildDelayedPayload', () => {
        it('should build delayed payload with exponential backoff for email', () => {
            const notification = createMockBaseNotification('email');
            const retryCount = 2;

            const result = delayedProducer.buildDelayedPayload(notification, 'email', retryCount);

            expect(result.notification_id).toBe(notification.notification_id);
            expect(result.request_id).toBe(notification.request_id);
            expect(result.client_id).toBe(notification.client_id);
            expect(result.target_topic).toBe('email_notification');
            expect(result.payload.retry_count).toBe(retryCount);
        });

        it('should calculate scheduled_at with exponential delay', () => {
            const notification = createMockBaseNotification('email');
            const retryCount = 3; // delay = 2^3 * 1000 = 8000ms

            const beforeTime = Date.now();
            const result = delayedProducer.buildDelayedPayload(notification, 'email', retryCount);
            const afterTime = Date.now();

            const scheduledTime = new Date(result.scheduled_at).getTime();

            // Should be about 8 seconds in the future
            expect(scheduledTime).toBeGreaterThanOrEqual(beforeTime + 8000);
            expect(scheduledTime).toBeLessThanOrEqual(afterTime + 8000 + 100);
        });

        it('should include created_at timestamp', () => {
            const notification = createMockBaseNotification('email');

            const result = delayedProducer.buildDelayedPayload(notification, 'email', 1);

            expect(result.created_at).toBeDefined();
        });

        it('should build delayed payload for WhatsApp', () => {
            const notification = createMockBaseNotification('whatsapp');
            const retryCount = 2;

            const result = delayedProducer.buildDelayedPayload(notification, 'whatsapp', retryCount);

            expect(result.notification_id).toBe(notification.notification_id);
            expect(result.target_topic).toBe('whatsapp_notification');
            expect(result.payload.retry_count).toBe(retryCount);
        });

        it('should calculate backoff correctly for retry 1', () => {
            const notification = createMockBaseNotification('whatsapp');
            const retryCount = 1; // delay = 2^1 * 1000 = 2000ms

            const beforeTime = Date.now();
            const result = delayedProducer.buildDelayedPayload(notification, 'whatsapp', retryCount);

            const scheduledTime = new Date(result.scheduled_at).getTime();
            expect(scheduledTime).toBeGreaterThanOrEqual(beforeTime + 2000);
        });

        it('should work with any channel', () => {
            const notification = createMockBaseNotification('sms');
            const retryCount = 2;

            const result = delayedProducer.buildDelayedPayload(notification, 'sms', retryCount);

            expect(result.target_topic).toBe('sms_notification');
        });
    });

    describe('publishDelayed', () => {
        it('should throw error if producer not initialized', async () => {
            const payload = delayedProducer.buildDelayedPayload(
                createMockBaseNotification('email'),
                'email',
                1
            );

            await expect(delayedProducer.publishDelayed(payload)).rejects.toThrow();
        });

        it('should send message to delayed_notification topic', async () => {
            await delayedProducer.initDelayedProducer();

            const payload = delayedProducer.buildDelayedPayload(
                createMockBaseNotification('email'),
                'email',
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
