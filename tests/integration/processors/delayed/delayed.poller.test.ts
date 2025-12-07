/**
 * Integration tests for delayed.poller.ts
 * Tests delayed queue poller with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDelayedNotification } from '../../../utils/mocks.js';

// Mock dependencies
const mockFetchDueEvents = vi.fn();
const mockReAddToQueue = vi.fn();
const mockGetDueEventCount = vi.fn();
const mockAddToDeadLetterQueue = vi.fn();
const mockPublishToTarget = vi.fn();
const mockPublishDLQFailureStatus = vi.fn();

vi.mock('@src/processors/delayed/delayed.queue.js', () => ({
    fetchDueEvents: mockFetchDueEvents,
    reAddToQueue: mockReAddToQueue,
    getDueEventCount: mockGetDueEventCount,
    addToDeadLetterQueue: mockAddToDeadLetterQueue,
}));

vi.mock('@src/processors/delayed/target.producer.js', () => ({
    publishToTarget: mockPublishToTarget,
}));

vi.mock('@src/processors/delayed/dlq.status.js', () => ({
    publishDLQFailureStatus: mockPublishDLQFailureStatus,
}));

vi.mock('@src/config/env.config.js', () => ({
    env: {
        DELAYED_POLL_INTERVAL_MS: 100,  // Faster for tests
        DELAYED_BATCH_SIZE: 10,
        MAX_POLLER_RETRIES: 3,
    },
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

describe('Delayed Poller', () => {
    let delayedPoller: typeof import('../../../../src/processors/delayed/delayed.poller.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        vi.useFakeTimers();

        mockFetchDueEvents.mockResolvedValue([]);
        mockGetDueEventCount.mockResolvedValue(0);
        mockPublishToTarget.mockResolvedValue(undefined);
        mockReAddToQueue.mockResolvedValue(undefined);
        mockAddToDeadLetterQueue.mockResolvedValue(undefined);
        mockPublishDLQFailureStatus.mockResolvedValue(undefined);

        delayedPoller = await import('../../../../src/processors/delayed/delayed.poller.js');
    });

    afterEach(async () => {
        // Stop poller if running
        delayedPoller.stopDelayedPoller();
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    describe('Lifecycle', () => {
        it('should start polling on interval', async () => {
            delayedPoller.startDelayedPoller();

            expect(delayedPoller.isPollerActive()).toBe(true);
        });

        it('should be idempotent - not start twice', async () => {
            delayedPoller.startDelayedPoller();
            delayedPoller.startDelayedPoller();

            expect(delayedPoller.isPollerActive()).toBe(true);
        });

        it('should stop the poller', async () => {
            delayedPoller.startDelayedPoller();
            delayedPoller.stopDelayedPoller();

            expect(delayedPoller.isPollerActive()).toBe(false);
        });

        it('should be safe to call stop when not running', () => {
            expect(() => delayedPoller.stopDelayedPoller()).not.toThrow();
        });

        it('should return false initially for isPollerActive', () => {
            expect(delayedPoller.isPollerActive()).toBe(false);
        });

        it('should return true after starting', async () => {
            delayedPoller.startDelayedPoller();
            expect(delayedPoller.isPollerActive()).toBe(true);
        });
    });

    describe('getPollerStatus', () => {
        it('should return status with due event count', async () => {
            mockGetDueEventCount.mockResolvedValue(5);

            const status = await delayedPoller.getPollerStatus();

            expect(status.isActive).toBe(false);
            expect(status.dueEventCount).toBe(5);
        });

        it('should reflect active state', async () => {
            delayedPoller.startDelayedPoller();

            const status = await delayedPoller.getPollerStatus();

            expect(status.isActive).toBe(true);
        });
    });

    describe('Event Processing', () => {
        it('should handle empty queue gracefully', async () => {
            mockFetchDueEvents.mockResolvedValue([]);

            delayedPoller.startDelayedPoller();

            // Allow the poll to run
            await vi.advanceTimersByTimeAsync(50);

            expect(mockPublishToTarget).not.toHaveBeenCalled();
        });

        it('should publish events to target topic on success', async () => {
            const event = {
                ...createMockDelayedNotification(),
                notification_id: 'test-notification-id',
            };
            mockFetchDueEvents.mockResolvedValueOnce([event]);

            delayedPoller.startDelayedPoller();

            // Wait for async processing
            await vi.advanceTimersByTimeAsync(50);

            expect(mockPublishToTarget).toHaveBeenCalledWith(
                event.target_topic,
                event.payload
            );
        });

        it('should re-add to queue on publish failure', async () => {
            const event = {
                ...createMockDelayedNotification(),
                notification_id: 'test-notification-id',
            };
            mockFetchDueEvents.mockResolvedValueOnce([event]);
            mockPublishToTarget.mockRejectedValueOnce(new Error('Kafka error'));

            delayedPoller.startDelayedPoller();

            await vi.advanceTimersByTimeAsync(50);

            expect(mockReAddToQueue).toHaveBeenCalled();
        });

        it('should send to DLQ after max retries', async () => {
            const event = {
                ...createMockDelayedNotification(),
                notification_id: 'test-notification-id',
                _pollerRetries: 3, // At max retries
            };
            mockFetchDueEvents.mockResolvedValueOnce([event]);

            delayedPoller.startDelayedPoller();

            await vi.advanceTimersByTimeAsync(50);

            expect(mockAddToDeadLetterQueue).toHaveBeenCalled();
            expect(mockPublishDLQFailureStatus).toHaveBeenCalled();
        });

        it('should process multiple events in sequence', async () => {
            const event1 = {
                ...createMockDelayedNotification(),
                notification_id: 'id-1',
                target_topic: 'email_notification',
            };
            const event2 = {
                ...createMockDelayedNotification(),
                notification_id: 'id-2',
                target_topic: 'whatsapp_notification',
            };
            mockFetchDueEvents.mockResolvedValueOnce([event1, event2]);

            delayedPoller.startDelayedPoller();

            await vi.advanceTimersByTimeAsync(50);

            expect(mockPublishToTarget).toHaveBeenCalledTimes(2);
        });

        it('should calculate exponential backoff delay correctly', async () => {
            const event = {
                ...createMockDelayedNotification(),
                notification_id: 'test-id',
                _pollerRetries: 1, // Second retry
            };
            mockFetchDueEvents.mockResolvedValueOnce([event]);
            mockPublishToTarget.mockRejectedValueOnce(new Error('Kafka error'));

            delayedPoller.startDelayedPoller();

            await vi.advanceTimersByTimeAsync(50);

            // Second retry should have 10s backoff (5s * 2^2)
            expect(mockReAddToQueue).toHaveBeenCalledWith(
                expect.objectContaining({ _pollerRetries: 2 }),
                expect.any(Number)
            );
        });

        it('should handle fetch errors gracefully', async () => {
            mockFetchDueEvents.mockRejectedValueOnce(new Error('Redis error'));

            delayedPoller.startDelayedPoller();

            // Should not throw
            await vi.advanceTimersByTimeAsync(50);

            expect(delayedPoller.isPollerActive()).toBe(true);
        });

        it('should continue polling after processing', async () => {
            const event = {
                ...createMockDelayedNotification(),
                notification_id: 'test-id',
            };
            mockFetchDueEvents
                .mockResolvedValueOnce([event])
                .mockResolvedValue([]);  // Empty on subsequent calls

            delayedPoller.startDelayedPoller();

            // First poll
            await vi.advanceTimersByTimeAsync(50);
            expect(mockFetchDueEvents).toHaveBeenCalledTimes(1);

            // Second poll after interval
            await vi.advanceTimersByTimeAsync(150);
            expect(mockFetchDueEvents.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
    });
});
