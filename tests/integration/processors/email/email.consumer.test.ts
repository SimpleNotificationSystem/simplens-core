/**
 * Integration tests for email.consumer.ts
 * Tests email consumer message processing with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockEmailNotification } from '../../../utils/mocks.js';
import mongoose from 'mongoose';

// Mock dependencies
const mockSendEmail = vi.fn();
const mockPublishStatus = vi.fn();
const mockPublishDelayed = vi.fn();
const mockTryAcquireProcessingLock = vi.fn();
const mockSetDelivered = vi.fn();
const mockSetFailed = vi.fn();
const mockConsumeToken = vi.fn();
const mockBuildDelayedPayloadFromEmail = vi.fn();

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

vi.mock('@src/config/kafka.config.js', () => ({
    kafka: {
        consumer: vi.fn(() => mockConsumer),
    },
}));

vi.mock('@src/processors/email/email.service.js', () => ({
    sendEmail: mockSendEmail,
    initEmailTransporter: vi.fn(),
}));

vi.mock('@src/processors/shared/status.producer.js', () => ({
    publishStatus: mockPublishStatus,
    initStatusProducer: vi.fn(),
}));

vi.mock('@src/processors/shared/delayed.producer.js', () => ({
    publishDelayed: mockPublishDelayed,
    buildDelayedPayloadFromEmail: mockBuildDelayedPayloadFromEmail,
    initDelayedProducer: vi.fn(),
}));

vi.mock('@src/processors/shared/idempotency.js', () => ({
    tryAcquireProcessingLock: mockTryAcquireProcessingLock,
    setDelivered: mockSetDelivered,
    setFailed: mockSetFailed,
}));

vi.mock('@src/processors/shared/rate-limiter.js', () => ({
    consumeToken: mockConsumeToken,
}));

vi.mock('@src/workers/utils/logger.js', () => ({
    emailProcessorLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('@src/config/env.config.js', () => ({
    env: {
        MAX_RETRY_COUNT: 3,
    },
}));

describe('Email Consumer', () => {
    let emailConsumer: typeof import('../../../../src/processors/email/email.consumer.js');
    let capturedMessageHandler: ((payload: any) => Promise<void>) | null = null;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        capturedMessageHandler = null;

        // Default mock behaviors
        mockTryAcquireProcessingLock.mockResolvedValue({ canProcess: true, isRetry: false });
        mockConsumeToken.mockResolvedValue({ allowed: true });
        mockSendEmail.mockResolvedValue({ success: true, messageId: 'msg-123' });
        mockBuildDelayedPayloadFromEmail.mockImplementation((n, r) => ({ ...n, retry_count: r }));

        // Capture the message handler when run is called
        mockConsumerRun.mockImplementation(async (config: any) => {
            capturedMessageHandler = config.eachMessage;
        });

        emailConsumer = await import('../../../../src/processors/email/email.consumer.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Lifecycle', () => {
        it('should connect and subscribe to email_notification topic', async () => {
            await emailConsumer.startEmailConsumer();

            expect(mockConsumerConnect).toHaveBeenCalled();
            expect(mockConsumerSubscribe).toHaveBeenCalledWith(
                expect.objectContaining({
                    topic: 'email_notification',
                })
            );
            expect(mockConsumerRun).toHaveBeenCalled();
        });

        it('should be idempotent - not start twice', async () => {
            await emailConsumer.startEmailConsumer();
            await emailConsumer.startEmailConsumer();

            expect(mockConsumerConnect).toHaveBeenCalledTimes(1);
        });

        it('should stop and disconnect consumer', async () => {
            await emailConsumer.startEmailConsumer();
            await emailConsumer.stopEmailConsumer();

            expect(mockConsumerStop).toHaveBeenCalled();
            expect(mockConsumerDisconnect).toHaveBeenCalled();
        });

        it('should be safe to stop when not running', async () => {
            await expect(emailConsumer.stopEmailConsumer()).resolves.not.toThrow();
        });

        it('should return false initially for isEmailConsumerRunning', () => {
            expect(emailConsumer.isEmailConsumerRunning()).toBe(false);
        });

        it('should return true after starting', async () => {
            await emailConsumer.startEmailConsumer();
            expect(emailConsumer.isEmailConsumerRunning()).toBe(true);
        });
    });

    describe('Message Processing', () => {
        const createKafkaMessage = (notification: any) => {
            // Convert ObjectId to string for JSON serialization
            const notificationForJson = {
                ...notification,
                notification_id: notification.notification_id.toString(),
                created_at: notification.created_at instanceof Date
                    ? notification.created_at.toISOString()
                    : notification.created_at,
            };
            return {
                partition: 0,
                message: {
                    offset: '0',
                    value: Buffer.from(JSON.stringify(notificationForJson)),
                },
            };
        };

        beforeEach(async () => {
            await emailConsumer.startEmailConsumer();
        });

        it('should process valid message and send email successfully', async () => {
            const notification = createMockEmailNotification();
            const kafkaMessage = createKafkaMessage(notification);

            await capturedMessageHandler!(kafkaMessage);

            expect(mockTryAcquireProcessingLock).toHaveBeenCalled();
            expect(mockConsumeToken).toHaveBeenCalled();
            expect(mockSendEmail).toHaveBeenCalled();
            expect(mockSetDelivered).toHaveBeenCalled();
            expect(mockPublishStatus).toHaveBeenCalled();
        });

        it('should skip empty messages', async () => {
            const kafkaMessage = {
                partition: 0,
                message: {
                    offset: '0',
                    value: null,
                },
            };

            await capturedMessageHandler!(kafkaMessage);

            expect(mockTryAcquireProcessingLock).not.toHaveBeenCalled();
            expect(mockSendEmail).not.toHaveBeenCalled();
        });

        it('should skip messages that fail schema validation', async () => {
            const kafkaMessage = {
                partition: 0,
                message: {
                    offset: '0',
                    value: Buffer.from(JSON.stringify({ invalid: 'data' })),
                },
            };

            await capturedMessageHandler!(kafkaMessage);

            expect(mockTryAcquireProcessingLock).not.toHaveBeenCalled();
            expect(mockSendEmail).not.toHaveBeenCalled();
        });

        it('should skip duplicate notifications', async () => {
            const notification = createMockEmailNotification();
            const kafkaMessage = createKafkaMessage(notification);

            mockTryAcquireProcessingLock.mockResolvedValueOnce({ canProcess: false });

            await capturedMessageHandler!(kafkaMessage);

            expect(mockTryAcquireProcessingLock).toHaveBeenCalled();
            expect(mockSendEmail).not.toHaveBeenCalled();
        });

        it('should handle rate limiting and push to delayed queue', async () => {
            const notification = createMockEmailNotification();
            const kafkaMessage = createKafkaMessage(notification);

            mockConsumeToken.mockResolvedValueOnce({ allowed: false, retryAfterMs: 1000 });

            await capturedMessageHandler!(kafkaMessage);

            expect(mockSetFailed).toHaveBeenCalled();
            expect(mockBuildDelayedPayloadFromEmail).toHaveBeenCalled();
            expect(mockPublishDelayed).toHaveBeenCalled();
        });

        it('should fail permanently when rate limited and max retries exceeded', async () => {
            const notification = { ...createMockEmailNotification(), retry_count: 3 };
            const kafkaMessage = createKafkaMessage(notification);

            mockConsumeToken.mockResolvedValueOnce({ allowed: false, retryAfterMs: 1000 });

            await capturedMessageHandler!(kafkaMessage);

            expect(mockSetFailed).toHaveBeenCalled();
            expect(mockPublishStatus).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'failed',
                })
            );
            expect(mockPublishDelayed).not.toHaveBeenCalled();
        });

        it('should push to delayed queue on email send failure', async () => {
            const notification = createMockEmailNotification();
            const kafkaMessage = createKafkaMessage(notification);

            mockSendEmail.mockResolvedValueOnce({ success: false, error: 'SMTP error' });

            await capturedMessageHandler!(kafkaMessage);

            expect(mockSetFailed).toHaveBeenCalled();
            expect(mockBuildDelayedPayloadFromEmail).toHaveBeenCalled();
            expect(mockPublishDelayed).toHaveBeenCalled();
        });

        it('should fail permanently on send failure when max retries exceeded', async () => {
            const notification = { ...createMockEmailNotification(), retry_count: 3 };
            const kafkaMessage = createKafkaMessage(notification);

            mockSendEmail.mockResolvedValueOnce({ success: false, error: 'SMTP error' });

            await capturedMessageHandler!(kafkaMessage);

            expect(mockSetFailed).toHaveBeenCalled();
            expect(mockPublishStatus).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'failed',
                })
            );
        });

        it('should handle Redis error gracefully after successful email', async () => {
            const notification = createMockEmailNotification();
            const kafkaMessage = createKafkaMessage(notification);

            mockSetDelivered.mockRejectedValueOnce(new Error('Redis error'));

            await capturedMessageHandler!(kafkaMessage);

            // Should still publish success status
            expect(mockPublishStatus).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'delivered',
                })
            );
        });

        it('should handle JSON parse errors gracefully', async () => {
            const kafkaMessage = {
                partition: 0,
                message: {
                    offset: '0',
                    value: Buffer.from('invalid json{'),
                },
            };

            // Should not throw
            await expect(capturedMessageHandler!(kafkaMessage)).resolves.not.toThrow();
            expect(mockSendEmail).not.toHaveBeenCalled();
        });
    });
});
