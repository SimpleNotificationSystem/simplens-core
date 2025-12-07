/**
 * Integration tests for delayed.consumer.ts
 * Tests delayed notification consumer with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDelayedNotification } from '../../../utils/mocks.js';

// Mock Kafka consumer
const mockConsumerSubscribe = vi.fn();
const mockConsumerRun = vi.fn();
const mockConsumerStop = vi.fn();
const mockConsumerDisconnect = vi.fn();
const mockConsumerConnect = vi.fn();

const mockConsumer = {
    connect: mockConsumerConnect,
    subscribe: mockConsumerSubscribe,
    run: mockConsumerRun,
    stop: mockConsumerStop,
    disconnect: mockConsumerDisconnect,
};

const mockAddToDelayedQueue = vi.fn();

vi.mock('@src/config/kafka.config.js', () => ({
    kafka: {
        consumer: vi.fn(() => mockConsumer),
    },
}));

vi.mock('@src/processors/delayed/delayed.queue.js', () => ({
    addToDelayedQueue: mockAddToDelayedQueue,
}));

vi.mock('@src/workers/utils/logger.js', () => ({
    delayedWorkerLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('Delayed Consumer', () => {
    let delayedConsumer: typeof import('../../../../src/processors/delayed/delayed.consumer.js');
    let capturedMessageHandler: ((payload: any) => Promise<void>) | null = null;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        capturedMessageHandler = null;

        mockAddToDelayedQueue.mockResolvedValue(undefined);

        // Capture the message handler when run is called
        mockConsumerRun.mockImplementation(async (config: any) => {
            capturedMessageHandler = config.eachMessage;
        });

        delayedConsumer = await import('../../../../src/processors/delayed/delayed.consumer.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Lifecycle', () => {
        it('should connect and subscribe to delayed_notification topic', async () => {
            await delayedConsumer.startDelayedConsumer();

            expect(mockConsumerConnect).toHaveBeenCalled();
            expect(mockConsumerSubscribe).toHaveBeenCalledWith(
                expect.objectContaining({
                    topic: 'delayed_notification',
                })
            );
            expect(mockConsumerRun).toHaveBeenCalled();
        });

        it('should configure consumer with correct group id', async () => {
            const kafkaModule = await import('../../../../src/config/kafka.config.js');

            await delayedConsumer.startDelayedConsumer();

            expect(kafkaModule.kafka.consumer).toHaveBeenCalledWith(
                expect.objectContaining({
                    groupId: 'delayed-worker-group',
                })
            );
        });

        it('should be idempotent - not start twice', async () => {
            await delayedConsumer.startDelayedConsumer();
            await delayedConsumer.startDelayedConsumer();

            expect(mockConsumerConnect).toHaveBeenCalledTimes(1);
        });

        it('should stop and disconnect consumer', async () => {
            await delayedConsumer.startDelayedConsumer();
            await delayedConsumer.stopDelayedConsumer();

            expect(mockConsumerStop).toHaveBeenCalled();
            expect(mockConsumerDisconnect).toHaveBeenCalled();
        });

        it('should be safe to call stop when not running', async () => {
            await expect(delayedConsumer.stopDelayedConsumer()).resolves.not.toThrow();
        });

        it('should return false initially for isConsumerActive', () => {
            expect(delayedConsumer.isConsumerActive()).toBe(false);
        });

        it('should return true after starting', async () => {
            await delayedConsumer.startDelayedConsumer();
            expect(delayedConsumer.isConsumerActive()).toBe(true);
        });
    });

    describe('Message Processing', () => {
        const createKafkaMessage = (notification: any) => ({
            topic: 'delayed_notification',
            partition: 0,
            message: {
                offset: '0',
                value: Buffer.from(JSON.stringify(notification)),
            },
        });

        beforeEach(async () => {
            await delayedConsumer.startDelayedConsumer();
        });

        it('should process valid message and add to delayed queue', async () => {
            const notification = createMockDelayedNotification();
            // Convert ObjectId to string for JSON
            const notificationForJson = {
                ...notification,
                notification_id: notification.notification_id.toString(),
            };
            const kafkaMessage = createKafkaMessage(notificationForJson);

            await capturedMessageHandler!(kafkaMessage);

            expect(mockAddToDelayedQueue).toHaveBeenCalled();
        });

        it('should skip empty messages', async () => {
            const kafkaMessage = {
                topic: 'delayed_notification',
                partition: 0,
                message: {
                    offset: '0',
                    value: null,
                },
            };

            await capturedMessageHandler!(kafkaMessage);

            expect(mockAddToDelayedQueue).not.toHaveBeenCalled();
        });

        it('should skip messages that fail schema validation', async () => {
            const kafkaMessage = {
                topic: 'delayed_notification',
                partition: 0,
                message: {
                    offset: '0',
                    value: Buffer.from(JSON.stringify({ invalid: 'data' })),
                },
            };

            await capturedMessageHandler!(kafkaMessage);

            expect(mockAddToDelayedQueue).not.toHaveBeenCalled();
        });

        it('should handle JSON parse errors gracefully', async () => {
            const kafkaMessage = {
                topic: 'delayed_notification',
                partition: 0,
                message: {
                    offset: '0',
                    value: Buffer.from('invalid json{'),
                },
            };

            // Should not throw
            await expect(capturedMessageHandler!(kafkaMessage)).resolves.not.toThrow();
            expect(mockAddToDelayedQueue).not.toHaveBeenCalled();
        });

        it('should handle Redis queue errors gracefully', async () => {
            const notification = createMockDelayedNotification();
            const notificationForJson = {
                ...notification,
                notification_id: notification.notification_id.toString(),
            };
            const kafkaMessage = createKafkaMessage(notificationForJson);

            mockAddToDelayedQueue.mockRejectedValueOnce(new Error('Redis error'));

            // Should not throw
            await expect(capturedMessageHandler!(kafkaMessage)).resolves.not.toThrow();
        });
    });
});
