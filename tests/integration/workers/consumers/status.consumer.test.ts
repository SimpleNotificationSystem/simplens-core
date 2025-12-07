/**
 * Integration tests for status.consumer.ts
 * Tests status consumer with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

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

const mockFindByIdAndUpdate = vi.fn();

vi.mock('@src/config/kafka.config.js', () => ({
    kafka: {
        consumer: vi.fn(() => mockConsumer),
    },
}));

// Mock notification model
vi.mock('@src/database/models/notification.models.js', () => ({
    default: {
        findByIdAndUpdate: mockFindByIdAndUpdate,
    },
}));

vi.mock('@src/workers/utils/logger.js', () => ({
    consumerLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('Status Consumer', () => {
    let statusConsumer: typeof import('../../../../src/workers/consumers/status.consumer.js');
    let capturedMessageHandler: ((payload: any) => Promise<void>) | null = null;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        capturedMessageHandler = null;

        mockFindByIdAndUpdate.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

        // Capture the message handler when run is called
        mockConsumerRun.mockImplementation(async (config: any) => {
            capturedMessageHandler = config.eachMessage;
        });

        // Mock fetch for webhook tests
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
        });

        statusConsumer = await import('../../../../src/workers/consumers/status.consumer.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Lifecycle', () => {
        it('should connect and subscribe to notification_status topic', async () => {
            await statusConsumer.startStatusConsumer();

            expect(mockConsumerConnect).toHaveBeenCalled();
            expect(mockConsumerSubscribe).toHaveBeenCalledWith(
                expect.objectContaining({
                    topic: 'notification_status',
                })
            );
            expect(mockConsumerRun).toHaveBeenCalled();
        });

        it('should configure consumer with correct group id', async () => {
            const kafkaModule = await import('../../../../src/config/kafka.config.js');

            await statusConsumer.startStatusConsumer();

            expect(kafkaModule.kafka.consumer).toHaveBeenCalledWith(
                expect.objectContaining({
                    groupId: 'notification-status-group',
                })
            );
        });

        it('should be idempotent - not start twice', async () => {
            await statusConsumer.startStatusConsumer();
            await statusConsumer.startStatusConsumer();

            expect(mockConsumerConnect).toHaveBeenCalledTimes(1);
        });

        it('should stop and disconnect consumer', async () => {
            await statusConsumer.startStatusConsumer();
            await statusConsumer.stopStatusConsumer();

            expect(mockConsumerStop).toHaveBeenCalled();
            expect(mockConsumerDisconnect).toHaveBeenCalled();
        });

        it('should be safe to call when not running', async () => {
            await expect(statusConsumer.stopStatusConsumer()).resolves.not.toThrow();
        });

        it('should return false initially for isStatusConsumerRunning', () => {
            expect(statusConsumer.isStatusConsumerRunning()).toBe(false);
        });

        it('should return true after starting', async () => {
            await statusConsumer.startStatusConsumer();
            expect(statusConsumer.isStatusConsumerRunning()).toBe(true);
        });
    });

    describe('Message Processing', () => {
        const createStatusMessage = (overrides = {}) => {
            const notificationId = new mongoose.Types.ObjectId();
            return {
                notification_id: notificationId.toString(),
                request_id: '12345678-1234-4234-8234-123456789012',
                client_id: '12345678-1234-4234-8234-123456789012',
                channel: 'email',
                status: 'delivered',
                message: 'Email sent successfully',
                retry_count: 0,
                webhook_url: 'https://example.com/webhook',
                created_at: new Date().toISOString(),
                ...overrides,
            };
        };

        const createKafkaMessage = (data: any) => ({
            partition: 0,
            message: {
                offset: '0',
                value: Buffer.from(JSON.stringify(data)),
            },
        });

        beforeEach(async () => {
            await statusConsumer.startStatusConsumer();
        });

        it('should process valid status message and update MongoDB', async () => {
            const statusData = createStatusMessage();
            const kafkaMessage = createKafkaMessage(statusData);

            await capturedMessageHandler!(kafkaMessage);

            expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
                statusData.notification_id,
                expect.objectContaining({
                    status: 'delivered',
                }),
                { new: true }
            );
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

            expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
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

            expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
        });

        it('should store error message for failed status', async () => {
            const statusData = createStatusMessage({
                status: 'failed',
                message: 'SMTP error',
            });
            const kafkaMessage = createKafkaMessage(statusData);

            await capturedMessageHandler!(kafkaMessage);

            expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    status: 'failed',
                    error_message: 'SMTP error',
                }),
                expect.anything()
            );
        });

        it('should send webhook callback when webhook_url is provided', async () => {
            const statusData = createStatusMessage({
                webhook_url: 'https://example.com/webhook',
            });
            const kafkaMessage = createKafkaMessage(statusData);

            await capturedMessageHandler!(kafkaMessage);

            expect(global.fetch).toHaveBeenCalledWith(
                'https://example.com/webhook',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                    }),
                })
            );
        });

        it('should not send webhook when webhook_url is not provided', async () => {
            const statusData = createStatusMessage({ webhook_url: undefined });
            const kafkaMessage = createKafkaMessage(statusData);

            await capturedMessageHandler!(kafkaMessage);

            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should handle webhook failure gracefully', async () => {
            const statusData = createStatusMessage();
            const kafkaMessage = createKafkaMessage(statusData);

            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            // Should not throw
            await expect(capturedMessageHandler!(kafkaMessage)).resolves.not.toThrow();
        });

        it('should handle notification not found gracefully', async () => {
            const statusData = createStatusMessage();
            const kafkaMessage = createKafkaMessage(statusData);

            mockFindByIdAndUpdate.mockResolvedValueOnce(null);

            // Should not throw
            await expect(capturedMessageHandler!(kafkaMessage)).resolves.not.toThrow();
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
            expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
        });

        it('should retry webhook on 5xx errors', async () => {
            const statusData = createStatusMessage();
            const kafkaMessage = createKafkaMessage(statusData);

            // First call fails with 500, second succeeds
            (global.fetch as any)
                .mockResolvedValueOnce({ ok: false, status: 500 })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            await capturedMessageHandler!(kafkaMessage);

            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should not retry webhook on 4xx errors', async () => {
            const statusData = createStatusMessage();
            const kafkaMessage = createKafkaMessage(statusData);

            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 400,
                statusText: 'Bad Request',
            });

            await capturedMessageHandler!(kafkaMessage);

            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});
