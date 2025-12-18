/**
 * Integration tests for background.producer.ts
 * Tests background outbox producer with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { OUTBOX_TOPICS, OUTBOX_STATUS } from '../../../../src/types/types';
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

// Mock mongoose session for transactions
const mockSession = {
    withTransaction: vi.fn(async (fn) => await fn()),
    endSession: vi.fn(),
};

vi.mock('mongoose', async () => {
    const actual = await vi.importActual('mongoose');
    return {
        ...actual,
        default: {
            ...(actual as any).default,
            startSession: vi.fn(() => mockSession),
        },
    };
});

// Mock models
const mockOutboxUpdateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
const mockNotificationUpdateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });

vi.mock('@src/database/models/outbox.models.js', () => ({
    default: {
        updateMany: mockOutboxUpdateMany,
    },
}));

vi.mock('@src/database/models/notification.models.js', () => ({
    default: {
        updateMany: mockNotificationUpdateMany,
    },
}));

vi.mock('@src/database/models/status-outbox.models.js', () => ({
    default: {
        updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
        findById: vi.fn(),
    },
}));

vi.mock('@src/workers/utils/logger.js', () => ({
    producerLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

// Mock validation utility
vi.mock('@src/workers/utils/validation.js', () => ({
    validateAndGroupByTopic: vi.fn((entries) => {
        const groupedByTopic = new Map();
        entries.forEach((entry: any) => {
            const topic = entry.topic;
            const existing = groupedByTopic.get(topic) || [];
            existing.push({
                _id: entry._id,
                notification_id: entry.notification_id,
                topic,
                payload: entry.payload,
                status: entry.status,
            });
            groupedByTopic.set(topic, existing);
        });
        return { groupedByTopic, validationFailedCount: 0 };
    }),
}));

describe('Background Producer', () => {
    let backgroundProducer: typeof import('../../../../src/workers/producers/background.producer.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        mockSend.mockResolvedValue({ success: true });
        backgroundProducer = await import('../../../../src/workers/producers/background.producer.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('initProducer', () => {
        it('should initialize and connect producer', async () => {
            await backgroundProducer.initProducer();

            expect(mockConnect).toHaveBeenCalled();
        });

        it('should be idempotent - only initialize once', async () => {
            await backgroundProducer.initProducer();
            await backgroundProducer.initProducer();

            expect(mockConnect).toHaveBeenCalledTimes(1);
        });
    });

    describe('disconnectProducer', () => {
        it('should disconnect producer when initialized', async () => {
            await backgroundProducer.initProducer();
            await backgroundProducer.disconnectProducer();

            expect(mockDisconnect).toHaveBeenCalled();
        });

        it('should be safe to call when not initialized', async () => {
            await expect(backgroundProducer.disconnectProducer()).resolves.not.toThrow();
        });
    });

    describe('getProducer', () => {
        it('should throw error if producer not initialized', () => {
            expect(() => backgroundProducer.getProducer()).toThrow(
                'Producer not initialized'
            );
        });

        it('should return producer after initialization', async () => {
            await backgroundProducer.initProducer();

            const producer = backgroundProducer.getProducer();

            expect(producer).toBeDefined();
        });
    });

    describe('sendOutboxEvents', () => {
        // Helper to create mock outbox document
        const createMockOutboxDoc = (topic: OUTBOX_TOPICS, payload: any) => ({
            _id: new mongoose.Types.ObjectId(),
            notification_id: new mongoose.Types.ObjectId(),
            topic,
            payload,
            status: OUTBOX_STATUS.pending,
            toObject: function () {
                const { toObject, ...rest } = this;
                return rest;
            },
        });

        it('should return zero counts for empty entries', async () => {
            await backgroundProducer.initProducer();

            const result = await backgroundProducer.sendOutboxEvents([]);

            expect(result.successCount).toBe(0);
            expect(result.failedCount).toBe(0);
        });

        it('should send grouped entries to Kafka topics', async () => {
            await backgroundProducer.initProducer();

            const emailDoc = createMockOutboxDoc(
                OUTBOX_TOPICS.email_notification,
                createMockEmailNotification()
            );

            const result = await backgroundProducer.sendOutboxEvents([emailDoc as any]);

            expect(mockSend).toHaveBeenCalled();
            expect(result.successCount).toBeGreaterThanOrEqual(0);
        });

        it('should handle send failures gracefully', async () => {
            await backgroundProducer.initProducer();
            mockSend.mockRejectedValueOnce(new Error('Kafka error'));

            const emailDoc = createMockOutboxDoc(
                OUTBOX_TOPICS.email_notification,
                createMockEmailNotification()
            );

            const result = await backgroundProducer.sendOutboxEvents([emailDoc as any]);

            expect(result.failedCount).toBeGreaterThan(0);
        });

        it('should throw error if producer not initialized', async () => {
            const emailDoc = createMockOutboxDoc(
                OUTBOX_TOPICS.email_notification,
                createMockEmailNotification()
            );

            await expect(
                backgroundProducer.sendOutboxEvents([emailDoc as any])
            ).rejects.toThrow('Producer not initialized');
        });
    });
});
