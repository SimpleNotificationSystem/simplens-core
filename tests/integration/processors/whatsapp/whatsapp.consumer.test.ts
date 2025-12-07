/**
 * Integration tests for whatsapp.consumer.ts
 * Tests WhatsApp consumer message processing with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockWhatsappNotification } from '../../../utils/mocks.js';

// Mock dependencies
const mockSendWhatsApp = vi.fn();
const mockPublishStatus = vi.fn();
const mockPublishDelayed = vi.fn();
const mockTryAcquireProcessingLock = vi.fn();
const mockSetDelivered = vi.fn();
const mockSetFailed = vi.fn();
const mockConsumeToken = vi.fn();
const mockBuildDelayedPayloadFromWhatsapp = vi.fn();

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

vi.mock('@src/processors/whatsapp/whatsapp.service.js', () => ({
    sendWhatsApp: mockSendWhatsApp,
    initWhatsAppService: vi.fn(),
}));

vi.mock('@src/processors/shared/status.producer.js', () => ({
    publishStatus: mockPublishStatus,
    initStatusProducer: vi.fn(),
}));

vi.mock('@src/processors/shared/delayed.producer.js', () => ({
    publishDelayed: mockPublishDelayed,
    buildDelayedPayloadFromWhatsapp: mockBuildDelayedPayloadFromWhatsapp,
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
    whatsappProcessorLogger: {
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

describe('WhatsApp Consumer', () => {
    let whatsappConsumer: typeof import('../../../../src/processors/whatsapp/whatsapp.consumer.js');
    let capturedMessageHandler: ((payload: any) => Promise<void>) | null = null;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        capturedMessageHandler = null;

        // Default mock behaviors
        mockTryAcquireProcessingLock.mockResolvedValue({ canProcess: true, isRetry: false });
        mockConsumeToken.mockResolvedValue({ allowed: true });
        mockSendWhatsApp.mockResolvedValue({ success: true, messageId: 'wa-msg-123' });
        mockBuildDelayedPayloadFromWhatsapp.mockImplementation((n, r) => ({ ...n, retry_count: r }));

        // Capture the message handler when run is called
        mockConsumerRun.mockImplementation(async (config: any) => {
            capturedMessageHandler = config.eachMessage;
        });

        whatsappConsumer = await import('../../../../src/processors/whatsapp/whatsapp.consumer.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Lifecycle', () => {
        it('should connect and subscribe to whatsapp_notification topic', async () => {
            await whatsappConsumer.startWhatsAppConsumer();

            expect(mockConsumerConnect).toHaveBeenCalled();
            expect(mockConsumerSubscribe).toHaveBeenCalledWith(
                expect.objectContaining({
                    topic: 'whatsapp_notification',
                })
            );
            expect(mockConsumerRun).toHaveBeenCalled();
        });

        it('should be idempotent - not start twice', async () => {
            await whatsappConsumer.startWhatsAppConsumer();
            await whatsappConsumer.startWhatsAppConsumer();

            expect(mockConsumerConnect).toHaveBeenCalledTimes(1);
        });

        it('should stop and disconnect consumer', async () => {
            await whatsappConsumer.startWhatsAppConsumer();
            await whatsappConsumer.stopWhatsAppConsumer();

            expect(mockConsumerStop).toHaveBeenCalled();
            expect(mockConsumerDisconnect).toHaveBeenCalled();
        });

        it('should be safe to stop when not running', async () => {
            await expect(whatsappConsumer.stopWhatsAppConsumer()).resolves.not.toThrow();
        });

        it('should return false initially for isWhatsAppConsumerRunning', () => {
            expect(whatsappConsumer.isWhatsAppConsumerRunning()).toBe(false);
        });

        it('should return true after starting', async () => {
            await whatsappConsumer.startWhatsAppConsumer();
            expect(whatsappConsumer.isWhatsAppConsumerRunning()).toBe(true);
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
            await whatsappConsumer.startWhatsAppConsumer();
        });

        it('should process valid message and send WhatsApp successfully', async () => {
            const notification = createMockWhatsappNotification();
            const kafkaMessage = createKafkaMessage(notification);

            await capturedMessageHandler!(kafkaMessage);

            expect(mockTryAcquireProcessingLock).toHaveBeenCalled();
            expect(mockConsumeToken).toHaveBeenCalled();
            expect(mockSendWhatsApp).toHaveBeenCalled();
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
            expect(mockSendWhatsApp).not.toHaveBeenCalled();
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
            expect(mockSendWhatsApp).not.toHaveBeenCalled();
        });

        it('should skip duplicate notifications', async () => {
            const notification = createMockWhatsappNotification();
            const kafkaMessage = createKafkaMessage(notification);

            mockTryAcquireProcessingLock.mockResolvedValueOnce({ canProcess: false });

            await capturedMessageHandler!(kafkaMessage);

            expect(mockTryAcquireProcessingLock).toHaveBeenCalled();
            expect(mockSendWhatsApp).not.toHaveBeenCalled();
        });

        it('should handle rate limiting and push to delayed queue', async () => {
            const notification = createMockWhatsappNotification();
            const kafkaMessage = createKafkaMessage(notification);

            mockConsumeToken.mockResolvedValueOnce({ allowed: false, retryAfterMs: 1000 });

            await capturedMessageHandler!(kafkaMessage);

            expect(mockSetFailed).toHaveBeenCalled();
            expect(mockBuildDelayedPayloadFromWhatsapp).toHaveBeenCalled();
            expect(mockPublishDelayed).toHaveBeenCalled();
        });

        it('should fail permanently when rate limited and max retries exceeded', async () => {
            const notification = { ...createMockWhatsappNotification(), retry_count: 3 };
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

        it('should push to delayed queue on send failure', async () => {
            const notification = createMockWhatsappNotification();
            const kafkaMessage = createKafkaMessage(notification);

            mockSendWhatsApp.mockResolvedValueOnce({ success: false, error: 'API error' });

            await capturedMessageHandler!(kafkaMessage);

            expect(mockSetFailed).toHaveBeenCalled();
            expect(mockBuildDelayedPayloadFromWhatsapp).toHaveBeenCalled();
            expect(mockPublishDelayed).toHaveBeenCalled();
        });

        it('should fail permanently on send failure when max retries exceeded', async () => {
            const notification = { ...createMockWhatsappNotification(), retry_count: 3 };
            const kafkaMessage = createKafkaMessage(notification);

            mockSendWhatsApp.mockResolvedValueOnce({ success: false, error: 'API error' });

            await capturedMessageHandler!(kafkaMessage);

            expect(mockSetFailed).toHaveBeenCalled();
            expect(mockPublishStatus).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'failed',
                })
            );
        });

        it('should handle Redis error gracefully after successful send', async () => {
            const notification = createMockWhatsappNotification();
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
            expect(mockSendWhatsApp).not.toHaveBeenCalled();
        });
    });
});
