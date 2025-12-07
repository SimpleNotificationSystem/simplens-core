/**
 * Unit tests for status.producer.ts
 * Tests notification status producer functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NOTIFICATION_STATUS_SF, CHANNEL } from '../../../../src/types/types.js';

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

describe('Status Producer', () => {
    let statusProducer: typeof import('../../../../src/processors/shared/status.producer.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        statusProducer = await import('../../../../src/processors/shared/status.producer.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('initStatusProducer', () => {
        it('should initialize producer and connect', async () => {
            await statusProducer.initStatusProducer();

            expect(mockConnect).toHaveBeenCalled();
        });

        it('should be idempotent - only initialize once', async () => {
            await statusProducer.initStatusProducer();
            await statusProducer.initStatusProducer();

            expect(mockConnect).toHaveBeenCalledTimes(1);
        });
    });

    describe('publishStatus', () => {
        const mockStatus = {
            notification_id: '507f1f77bcf86cd799439011',
            request_id: 'test-request-123',
            client_id: 'test-client',
            channel: CHANNEL.email as CHANNEL,
            status: NOTIFICATION_STATUS_SF.delivered as NOTIFICATION_STATUS_SF,
            external_id: 'ext-123',
            delivered_at: new Date(),
        };

        it('should throw error if producer not initialized', async () => {
            await expect(statusProducer.publishStatus(mockStatus)).rejects.toThrow(
                'Status producer not initialized'
            );
        });

        it('should send status to notification_status topic', async () => {
            await statusProducer.initStatusProducer();

            await statusProducer.publishStatus(mockStatus);

            expect(mockSend).toHaveBeenCalledWith({
                topic: 'notification_status',
                messages: [
                    {
                        key: mockStatus.notification_id.toString(),
                        value: JSON.stringify(mockStatus),
                    },
                ],
            });
        });

        it('should handle failed status', async () => {
            await statusProducer.initStatusProducer();

            const failedStatus = {
                ...mockStatus,
                status: NOTIFICATION_STATUS_SF.failed as NOTIFICATION_STATUS_SF,
                failed_at: new Date(),
                error_message: 'Delivery failed',
            };

            await statusProducer.publishStatus(failedStatus);

            expect(mockSend).toHaveBeenCalled();
            const sentMessage = JSON.parse(mockSend.mock.calls[0][0].messages[0].value);
            expect(sentMessage.status).toBe(NOTIFICATION_STATUS_SF.failed);
            expect(sentMessage.error_message).toBe('Delivery failed');
        });
    });

    describe('disconnectStatusProducer', () => {
        it('should disconnect producer when initialized', async () => {
            await statusProducer.initStatusProducer();

            await statusProducer.disconnectStatusProducer();

            expect(mockDisconnect).toHaveBeenCalled();
        });

        it('should be safe to call when not initialized', async () => {
            await expect(statusProducer.disconnectStatusProducer()).resolves.not.toThrow();
        });
    });
});
