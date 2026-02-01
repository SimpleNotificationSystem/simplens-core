/**
 * Unit Tests for Recovery Cron Cleanup Functions
 * Tests the automatic cleanup of resolved alerts and processed status outbox entries
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
const mockAlertModel = {
    deleteMany: vi.fn(),
    find: vi.fn(),
    updateOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findById: vi.fn(),
};

const mockStatusOutboxModel = {
    deleteMany: vi.fn(),
    create: vi.fn(),
};

const mockNotificationModel = {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
};

const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
};

// Mock all dependencies
vi.mock('mongoose', async () => {
    const actual = await vi.importActual('mongoose');
    return {
        ...actual,
        default: {
            ...actual,
            startSession: vi.fn(() => ({
                withTransaction: vi.fn((fn) => fn()),
                endSession: vi.fn(),
            })),
        },
    };
});

vi.mock('../../../../src/database/models/alert.models.js', () => ({
    default: mockAlertModel,
}));

vi.mock('../../../../src/database/models/status-outbox.models.js', () => ({
    default: mockStatusOutboxModel,
}));

vi.mock('../../../../src/database/models/notification.models.js', () => ({
    default: mockNotificationModel,
}));

vi.mock('../../../../src/workers/utils/logger.js', () => ({
    recoveryLogger: mockLogger,
}));

vi.mock('../../../../src/admin-alerts/admin-alert.service.js', () => ({
    AdminAlertService: {
        sendAlert: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../../../../src/processors/shared/idempotency.js', () => ({
    getIdempotencyStatus: vi.fn(),
    setFailed: vi.fn(),
}));

vi.mock('../../../../src/config/env.config.js', () => ({
    env: {
        PROCESSING_STUCK_THRESHOLD_MS: 300000, // 5 minutes
        PENDING_STUCK_THRESHOLD_MS: 300000,    // 5 minutes
        RECOVERY_BATCH_SIZE: 50,
        MAX_RETRY_COUNT: 5,
        RECOVERY_POLL_INTERVAL_MS: 60000,
        CLEANUP_RESOLVED_ALERTS_RETENTION_MS: 86400000,    // 24 hours
        CLEANUP_PROCESSED_STATUS_OUTBOX_RETENTION_MS: 86400000, // 24 hours
        RECOVERY_CLAIM_TIMEOUT_MS: 300000, // 5 minutes
        WORKER_ID: 'test-worker-1',
    },
}));

describe('Recovery Cron - Cleanup Functions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('recoverStuckProcessing', () => {
        it('should handle ghost delivery - Redis says delivered but DB says processing', async () => {
            const { getIdempotencyStatus } = await import('../../../../src/processors/shared/idempotency.js');

            // Mock getIdempotencyStatus to return delivered
            (getIdempotencyStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'delivered' });

            // Mock finding a stuck processing notification
            const mockNotificationId = '507f1f77bcf86cd799439011';
            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockResolvedValue([{
                    _id: mockNotificationId,
                    status: 'processing',
                    retry_count: 0,
                    updated_at: new Date('2024-01-15T11:00:00.000Z'), // 1 hour ago
                }]),
            });

            // Mock findOneAndUpdate to return the locked notification
            mockNotificationModel.findOneAndUpdate.mockResolvedValue({
                _id: mockNotificationId,
                status: 'processing',
                retry_count: 0,
            });

            // Mock updateOne for status update
            mockNotificationModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

            // Mock status outbox create
            mockStatusOutboxModel.create.mockResolvedValue([{}]);

            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
            mockStatusOutboxModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            setHealthChecker(async () => true);

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // Should have logged ghost delivery detection
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Ghost delivery detected')
            );
        });

        it('should handle exhausted retries - mark as failed', async () => {
            const { getIdempotencyStatus } = await import('../../../../src/processors/shared/idempotency.js');

            // Mock getIdempotencyStatus to return failed with exhausted retry count
            (getIdempotencyStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'failed', retry_count: 5 });

            // Mock finding a stuck notification with max retries
            const mockNotificationId = '507f1f77bcf86cd799439012';
            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockResolvedValue([{
                    _id: mockNotificationId,
                    status: 'processing',
                    retry_count: 5, // At max retry count
                    updated_at: new Date('2024-01-15T11:00:00.000Z'),
                }]),
            });

            mockNotificationModel.findOneAndUpdate.mockResolvedValue({
                _id: mockNotificationId,
                status: 'processing',
                retry_count: 5,
            });

            mockNotificationModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
            mockStatusOutboxModel.create.mockResolvedValue([{}]);
            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
            mockStatusOutboxModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            setHealthChecker(async () => true);

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // Should have logged exhausted retries
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('exhausted retries')
            );
        });

        it('should create alert for failed notification with retries remaining', async () => {
            const { getIdempotencyStatus } = await import('../../../../src/processors/shared/idempotency.js');

            // Mock getIdempotencyStatus to return failed with retries remaining
            (getIdempotencyStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'failed', retry_count: 2 });

            // Mock finding a stuck notification with retries remaining
            const mockNotificationId = '507f1f77bcf86cd799439013';
            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockResolvedValue([{
                    _id: mockNotificationId,
                    status: 'processing',
                    retry_count: 2, // Less than max
                    updated_at: new Date('2024-01-15T11:00:00.000Z'),
                }]),
            });

            mockNotificationModel.findOneAndUpdate.mockResolvedValue({
                _id: mockNotificationId,
                status: 'processing',
                retry_count: 2,
            });

            mockAlertModel.updateOne.mockResolvedValue({ upsertedCount: 1 });
            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
            mockStatusOutboxModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            setHealthChecker(async () => true);

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // Should have logged creating alert
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Creating alert for failed notification')
            );
        });

        it('should create alert for stuck notification with no Redis record', async () => {
            const { getIdempotencyStatus } = await import('../../../../src/processors/shared/idempotency.js');

            // Mock getIdempotencyStatus to return null (no record)
            (getIdempotencyStatus as ReturnType<typeof vi.fn>).mockResolvedValue(null);

            const mockNotificationId = '507f1f77bcf86cd799439014';
            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockResolvedValue([{
                    _id: mockNotificationId,
                    status: 'processing',
                    retry_count: 0,
                    updated_at: new Date('2024-01-15T11:00:00.000Z'),
                }]),
            });

            mockNotificationModel.findOneAndUpdate.mockResolvedValue({
                _id: mockNotificationId,
                status: 'processing',
                retry_count: 0,
            });

            mockAlertModel.updateOne.mockResolvedValue({ upsertedCount: 1 });
            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
            mockStatusOutboxModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            setHealthChecker(async () => true);

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // Should have logged creating alert for stuck notification
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Creating alert for stuck notification')
            );
        });

        it('should skip processing when no notifications to claim (race condition)', async () => {
            // Mock finding stuck notifications
            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockResolvedValue([{
                    _id: '507f1f77bcf86cd799439015',
                    status: 'processing',
                    retry_count: 0,
                    updated_at: new Date('2024-01-15T11:00:00.000Z'),
                }]),
            });

            // Mock findOneAndUpdate to return null (already claimed by another instance)
            mockNotificationModel.findOneAndUpdate.mockResolvedValue(null);

            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
            mockStatusOutboxModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            setHealthChecker(async () => true);

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // When findOneAndUpdate returns null, the loop breaks and no notification is processed
            // No specific log for "already recovered" - the loop just ends
            expect(mockNotificationModel.findOneAndUpdate).toHaveBeenCalled();
            // Should NOT have logged any processing (no notifications were claimed)
            expect(mockLogger.info).not.toHaveBeenCalledWith(
                expect.stringContaining('Ghost delivery detected')
            );
        });
    });

    describe('detectOrphanedPending', () => {
        it('should create alert for orphaned pending notifications', async () => {
            // First find returns no processing notifications
            // Second find returns orphaned pending
            let findCallCount = 0;
            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockImplementation(() => {
                    findCallCount++;
                    if (findCallCount === 1) {
                        return Promise.resolve([]); // No processing notifications
                    }
                    return Promise.resolve([{
                        _id: '507f1f77bcf86cd799439016',
                        status: 'pending',
                        retry_count: 0,
                        updated_at: new Date('2024-01-15T11:00:00.000Z'),
                    }]);
                }),
            });

            mockNotificationModel.findOneAndUpdate.mockResolvedValue({
                _id: '507f1f77bcf86cd799439016',
                status: 'pending',
                retry_count: 0,
            });

            mockAlertModel.updateOne.mockResolvedValue({ upsertedCount: 1 });
            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
            mockStatusOutboxModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            setHealthChecker(async () => true);

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // Should have logged creating alert for orphaned pending
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Created alert for orphaned pending notification')
            );
        });
    });

    describe('runRecovery health check behavior', () => {
        it('should log warning when consecutive failures reach threshold', async () => {
            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            // Set unhealthy checker
            setHealthChecker(async () => false);

            startRecoveryCron();

            // Run multiple cycles to accumulate failures
            for (let i = 0; i < 6; i++) {
                await vi.advanceTimersByTimeAsync(60000);
            }

            await stopRecoveryCron();

            // Should have logged about unhealthy databases after threshold
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('databases unhealthy')
            );
        });
    });

    describe('cleanupResolvedAlerts', () => {
        it('should delete resolved alerts older than retention period', async () => {
            // Mock deleteMany to return deleted count
            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 5 });

            // Import the module (which will use our mocks)
            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            // Set a healthy checker
            setHealthChecker(async () => true);

            // Mock notification queries to return empty (no stuck notifications)
            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
            });

            // Start the cron and let it run once
            startRecoveryCron();

            // Advance timers to trigger the cron
            await vi.advanceTimersByTimeAsync(100);

            // Stop the cron
            await stopRecoveryCron();

            // Verify deleteMany was called with correct query
            expect(mockAlertModel.deleteMany).toHaveBeenCalledWith({
                resolved: true,
                resolved_at: { $lt: expect.any(Date) },
            });

            // Verify the threshold date is 24 hours before current time
            const deleteCall = mockAlertModel.deleteMany.mock.calls[0][0];
            const thresholdDate = deleteCall.resolved_at.$lt;
            const expectedThreshold = new Date('2024-01-14T12:00:00.000Z'); // 24 hours before
            expect(thresholdDate.getTime()).toBe(expectedThreshold.getTime());

            // Verify logging when documents are deleted
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up 5 resolved alerts')
            );
        });

        it('should not log when no resolved alerts to cleanup', async () => {
            // Mock deleteMany to return 0 deleted
            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            setHealthChecker(async () => true);

            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
            });

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // Verify deleteMany was called
            expect(mockAlertModel.deleteMany).toHaveBeenCalled();

            // Verify no "Cleaned up" log for 0 deletions
            expect(mockLogger.info).not.toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up 0 resolved alerts')
            );
        });
    });

    describe('cleanupProcessedStatusOutbox', () => {
        it('should delete processed status outbox entries older than retention period', async () => {
            // Mock deleteMany to return deleted count
            mockStatusOutboxModel.deleteMany.mockResolvedValue({ deletedCount: 10 });
            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            setHealthChecker(async () => true);

            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
            });

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // Verify deleteMany was called with correct query
            expect(mockStatusOutboxModel.deleteMany).toHaveBeenCalledWith({
                processed: true,
                updated_at: { $lt: expect.any(Date) },
            });

            // Verify threshold date is 24 hours before current time
            const deleteCall = mockStatusOutboxModel.deleteMany.mock.calls[0][0];
            const thresholdDate = deleteCall.updated_at.$lt;
            const expectedThreshold = new Date('2024-01-14T12:00:00.000Z');
            expect(thresholdDate.getTime()).toBe(expectedThreshold.getTime());

            // Verify logging
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up 10 processed status outbox entries')
            );
        });

        it('should not log when no processed entries to cleanup', async () => {
            mockStatusOutboxModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            setHealthChecker(async () => true);

            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
            });

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // Verify no "Cleaned up" log for 0 deletions
            expect(mockLogger.info).not.toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up 0 processed status outbox')
            );
        });
    });

    describe('cleanup integration with recovery job', () => {
        it('should run cleanup after recovery checks', async () => {
            mockAlertModel.deleteMany.mockResolvedValue({ deletedCount: 2 });
            mockStatusOutboxModel.deleteMany.mockResolvedValue({ deletedCount: 3 });

            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            setHealthChecker(async () => true);

            // Mock no stuck notifications
            mockNotificationModel.find.mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
            });

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // Both cleanup functions should have been called
            expect(mockAlertModel.deleteMany).toHaveBeenCalled();
            expect(mockStatusOutboxModel.deleteMany).toHaveBeenCalled();

            // Verify both logged their cleanup counts
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up 2 resolved alerts')
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up 3 processed status outbox entries')
            );
        });

        it('should skip cleanup when health check fails', async () => {
            const { startRecoveryCron, stopRecoveryCron, setHealthChecker } = await import(
                '../../../../src/workers/recovery/recovery.cron.js'
            );

            // Set unhealthy checker
            setHealthChecker(async () => false);

            startRecoveryCron();
            await vi.advanceTimersByTimeAsync(100);
            await stopRecoveryCron();

            // Cleanup should not run when databases are unhealthy
            expect(mockAlertModel.deleteMany).not.toHaveBeenCalled();
            expect(mockStatusOutboxModel.deleteMany).not.toHaveBeenCalled();
        });
    });
});

