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
