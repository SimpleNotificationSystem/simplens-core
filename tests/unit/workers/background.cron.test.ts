/**
 * Unit Tests for Background Outbox Cron Jobs
 * Tests the batch 2-phase atomic claim, eager draining loop, and cleanup routines.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { OUTBOX_STATUS } from '../../../src/types/types.js';

// Mock dependencies
const mockOutboxModel = {
    find: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
};

const mockStatusOutboxModel = {
    find: vi.fn(),
    updateMany: vi.fn(),
};

const mockBackgroundProducer = {
    sendOutboxEvents: vi.fn(),
    sendStatusOutboxEvents: vi.fn(),
};

const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
};

vi.mock('@src/database/models/outbox.models.js', () => ({
    default: mockOutboxModel,
}));

vi.mock('@src/database/models/status-outbox.models.js', () => ({
    default: mockStatusOutboxModel,
}));

vi.mock('@src/workers/producers/background.producer.js', () => ({
    sendOutboxEvents: (...args: unknown[]) => mockBackgroundProducer.sendOutboxEvents(...args),
    sendStatusOutboxEvents: (...args: unknown[]) => mockBackgroundProducer.sendStatusOutboxEvents(...args),
}));

vi.mock('@src/workers/utils/logger.js', () => ({
    cronLogger: mockLogger,
}));

vi.mock('@src/config/env.config.js', () => ({
    env: {
        WORKER_ID: 'test-worker-1',
        OUTBOX_POLL_INTERVAL_MS: 5000,
        OUTBOX_CLEANUP_INTERVAL_MS: 60000,
        OUTBOX_BATCH_SIZE: 10,
        OUTBOX_RETENTION_MS: 300000,
        OUTBOX_CLAIM_TIMEOUT_MS: 30000,
    },
}));

vi.mock('@src/config/dynamic-config.service.js', () => ({
    dynamicConfig: {
        on: vi.fn(),
    },
}));

describe('Background Cron Unit Tests', () => {
    let cronModule: typeof import('../../../src/workers/cron/background.cron.js');

    const createEmptyChain = () => ({
        sort: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue([]),
                }),
            }),
        }),
    });

    beforeEach(async () => {
        vi.clearAllMocks();
        mockOutboxModel.find.mockImplementation(() => createEmptyChain());
        mockStatusOutboxModel.find.mockImplementation(() => createEmptyChain());
        cronModule = await import('../../../src/workers/cron/background.cron.js');
    });

    afterEach(async () => {
        await cronModule.stopCronJobs();
    });

    it('should manage cron job lifecycle (start, status, stop)', async () => {
        expect(cronModule.isCronRunning()).toBe(false);

        cronModule.startCronJobs();
        expect(cronModule.isCronRunning()).toBe(true);

        // Calling start again should be a no-op
        cronModule.startCronJobs();
        expect(cronModule.isCronRunning()).toBe(true);

        await cronModule.stopCronJobs();
        expect(cronModule.isCronRunning()).toBe(false);
    });

    it('should claim pending outbox entries using 2-phase atomic batch claim and drain eagerly', async () => {
        const id1 = new mongoose.Types.ObjectId();
        const id2 = new mongoose.Types.ObjectId();

        // Round 1: find returns 2 candidates (less than batch size 10), claiming finishes
        const mockCandidates = [{ _id: id1 }, { _id: id2 }];
        const mockClaimedDocs = [
            { _id: id1, status: OUTBOX_STATUS.processing, topic: 'notification_mock' },
            { _id: id2, status: OUTBOX_STATUS.processing, topic: 'notification_mock' },
        ];

        // Chain for outbox_model.find().sort().limit().select().lean()
        const selectLeanMock = {
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(mockCandidates),
            }),
        };
        const limitMock = {
            limit: vi.fn().mockReturnValue(selectLeanMock),
        };
        const sortMock = {
            sort: vi.fn().mockReturnValue(limitMock),
        };

        // When finding candidates vs finding claimed entries:
        mockOutboxModel.find.mockImplementation((query: Record<string, unknown>) => {
            if (query.status === OUTBOX_STATUS.pending) {
                return sortMock;
            }
            if (query.status === OUTBOX_STATUS.processing && query.claimed_at) {
                // Stale check: returns empty
                return {
                    sort: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            select: vi.fn().mockReturnValue({
                                lean: vi.fn().mockResolvedValue([]),
                            }),
                        }),
                    }),
                };
            }
            // Finding claimed docs by _id:
            return Promise.resolve(mockClaimedDocs);
        });

        mockOutboxModel.updateMany.mockResolvedValue({ modifiedCount: 2 });
        mockBackgroundProducer.sendOutboxEvents.mockResolvedValue({ successCount: 2, failedCount: 0 });

        // Trigger cron jobs (which immediately runs pollOutbox)
        cronModule.startCronJobs();
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify updateMany was called atomically
        expect(mockOutboxModel.updateMany).toHaveBeenCalledWith(
            { _id: { $in: [id1, id2] }, status: OUTBOX_STATUS.pending },
            expect.objectContaining({
                $set: expect.objectContaining({
                    status: OUTBOX_STATUS.processing,
                    claimed_by: 'test-worker-1',
                }),
            })
        );

        // Verify sendOutboxEvents was called with the claimed docs
        expect(mockBackgroundProducer.sendOutboxEvents).toHaveBeenCalledWith(mockClaimedDocs);
    });

    it('should reclaim stale entries when pending quota is remaining', async () => {
        const staleId = new mongoose.Types.ObjectId();
        const staleDoc = { _id: staleId, status: OUTBOX_STATUS.processing, topic: 'notification_mock' };

        // No pending candidates
        const emptyPending = {
            sort: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([]),
                    }),
                }),
            }),
        };

        // Stale candidates found
        const staleCandidates = {
            sort: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([{ _id: staleId }]),
                    }),
                }),
            }),
        };

        mockOutboxModel.find.mockImplementation((query: Record<string, unknown>) => {
            if (query.status === OUTBOX_STATUS.pending) {
                return emptyPending;
            }
            if (query.status === OUTBOX_STATUS.processing && query.claimed_at) {
                return staleCandidates;
            }
            return Promise.resolve([staleDoc]);
        });

        mockOutboxModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
        mockBackgroundProducer.sendOutboxEvents.mockResolvedValue({ successCount: 1, failedCount: 0 });

        cronModule.startCronJobs();
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(mockOutboxModel.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                _id: { $in: [staleId] },
                status: OUTBOX_STATUS.processing,
            }),
            expect.any(Object)
        );
        expect(mockBackgroundProducer.sendOutboxEvents).toHaveBeenCalledWith([staleDoc]);
    });

    it('should cleanup published events older than retention period', async () => {
        vi.useFakeTimers();
        try {
            mockOutboxModel.deleteMany.mockResolvedValue({ deletedCount: 5 });

            cronModule.startCronJobs();
            // Advance time to trigger cleanup interval (60,000ms)
            await vi.advanceTimersByTimeAsync(60000);

            expect(mockOutboxModel.deleteMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: OUTBOX_STATUS.published,
                })
            );
        } finally {
            vi.useRealTimers();
        }
    });
});
