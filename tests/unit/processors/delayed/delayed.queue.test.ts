/**
 * Unit tests for delayed.queue.ts
 * Tests Redis ZSET queue operations with mocked Redis
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDelayedNotification } from '../../../utils/mocks.js';

// Create mock Redis client with proper method signatures
const mockRedisClient = {
    zadd: vi.fn().mockResolvedValue(1),
    zrangebyscore: vi.fn().mockResolvedValue([]),
    zrem: vi.fn().mockResolvedValue(1),
    zcard: vi.fn().mockResolvedValue(0),
    zcount: vi.fn().mockResolvedValue(0),
    eval: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(1),
};

// Mock Redis config
vi.mock('@src/config/redis.config.js', () => ({
    getRedisClient: vi.fn(() => mockRedisClient),
}));

// Mock env config
vi.mock('@src/config/env.config.js', () => ({
    env: {
        WORKER_ID: 'test-worker-1',
    },
}));

// Mock logger
vi.mock('@src/workers/utils/logger.js', () => ({
    delayedWorkerLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('Delayed Queue', () => {
    let delayedQueue: typeof import('../../../../src/processors/delayed/delayed.queue.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        delayedQueue = await import('../../../../src/processors/delayed/delayed.queue.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('addToDelayedQueue', () => {
        it('should add event to queue with scheduled_at as score', async () => {
            const event = createMockDelayedNotification();
            const expectedScore = new Date(event.scheduled_at).getTime();

            await delayedQueue.addToDelayedQueue(event);

            expect(mockRedisClient.zadd).toHaveBeenCalledWith(
                'delayed_queue',
                expectedScore,
                JSON.stringify(event)
            );
        });

        it('should serialize event to JSON', async () => {
            const event = createMockDelayedNotification();

            await delayedQueue.addToDelayedQueue(event);

            const callArgs = mockRedisClient.zadd.mock.calls[0];
            const serializedEvent = callArgs[2];
            expect(() => JSON.parse(serializedEvent)).not.toThrow();
        });
    });

    describe('claimDueEvents (two-phase processing)', () => {
        it('should execute Lua script for atomic claim', async () => {
            mockRedisClient.eval.mockResolvedValue([]);

            await delayedQueue.claimDueEvents(10);

            expect(mockRedisClient.eval).toHaveBeenCalledWith(
                expect.stringContaining('ZRANGEBYSCORE'),
                2, // 2 keys: queue key and claim prefix
                'delayed_queue',
                'delayed_claim',
                expect.any(String), // now timestamp
                '10', // limit
                'test-worker-1', // worker id
                expect.any(String) // claim timeout
            );
        });

        it('should return empty array when no events are due', async () => {
            mockRedisClient.eval.mockResolvedValue([]);

            const result = await delayedQueue.claimDueEvents(10);

            expect(result).toEqual([]);
        });

        it('should parse and return claimed events', async () => {
            const event = createMockDelayedNotification();
            // Convert ObjectId to string for JSON serialization
            const eventForJson = {
                ...event,
                notification_id: event.notification_id.toString(),
            };
            mockRedisClient.eval.mockResolvedValue([JSON.stringify(eventForJson)]);

            const result = await delayedQueue.claimDueEvents(10);

            expect(result).toHaveLength(1);
            expect(result[0].notification_id.toString()).toBe(event.notification_id.toString());
        });

        it('should handle multiple events', async () => {
            const event1 = createMockDelayedNotification();
            const event2 = createMockDelayedNotification();
            // Convert ObjectId to string for JSON serialization
            const event1ForJson = { ...event1, notification_id: event1.notification_id.toString() };
            const event2ForJson = { ...event2, notification_id: event2.notification_id.toString() };
            mockRedisClient.eval.mockResolvedValue([
                JSON.stringify(event1ForJson),
                JSON.stringify(event2ForJson),
            ]);

            const result = await delayedQueue.claimDueEvents(10);

            expect(result).toHaveLength(2);
        });

        it('should skip malformed JSON entries', async () => {
            const validEvent = createMockDelayedNotification();
            const validEventForJson = { ...validEvent, notification_id: validEvent.notification_id.toString() };
            mockRedisClient.eval.mockResolvedValue([
                'invalid-json',
                JSON.stringify(validEventForJson),
            ]);

            const result = await delayedQueue.claimDueEvents(10);

            expect(result).toHaveLength(1);
        });
    });

    describe('confirmProcessed', () => {
        it('should execute Lua script to confirm processing', async () => {
            const event = createMockDelayedNotification();
            mockRedisClient.eval.mockResolvedValue(1);

            await delayedQueue.confirmProcessed(event);

            expect(mockRedisClient.eval).toHaveBeenCalledWith(
                expect.stringContaining('ZREM'),
                2, // 2 keys: queue key and claim key
                'delayed_queue',
                expect.stringContaining('delayed_claim'), // claim key with notification id
                JSON.stringify(event),
                'test-worker-1' // worker id
            );
        });

        it('should return true when confirmation succeeds', async () => {
            const event = createMockDelayedNotification();
            mockRedisClient.eval.mockResolvedValue(1);

            const result = await delayedQueue.confirmProcessed(event);

            expect(result).toBe(true);
        });

        it('should return false when claim was lost', async () => {
            const event = createMockDelayedNotification();
            mockRedisClient.eval.mockResolvedValue(0);

            const result = await delayedQueue.confirmProcessed(event);

            expect(result).toBe(false);
        });
    });

    describe('releaseClaim', () => {
        it('should execute Lua script to release claim', async () => {
            mockRedisClient.eval.mockResolvedValue(1);

            await delayedQueue.releaseClaim('test-notification-id');

            expect(mockRedisClient.eval).toHaveBeenCalledWith(
                expect.stringContaining('DEL'),
                1, // 1 key: claim key
                'delayed_claim:test-notification-id',
                'test-worker-1' // worker id
            );
        });

        it('should return true when release succeeds', async () => {
            mockRedisClient.eval.mockResolvedValue(1);

            const result = await delayedQueue.releaseClaim('test-notification-id');

            expect(result).toBe(true);
        });

        it('should return false when claim was already released', async () => {
            mockRedisClient.eval.mockResolvedValue(0);

            const result = await delayedQueue.releaseClaim('test-notification-id');

            expect(result).toBe(false);
        });
    });

    describe('getQueueSize', () => {
        it('should return queue size using ZCARD', async () => {
            mockRedisClient.zcard.mockResolvedValue(42);

            const result = await delayedQueue.getQueueSize();

            expect(result).toBe(42);
            expect(mockRedisClient.zcard).toHaveBeenCalledWith('delayed_queue');
        });
    });

    describe('getDueEventCount', () => {
        it('should return count of due events using ZCOUNT', async () => {
            mockRedisClient.zcount.mockResolvedValue(5);

            const result = await delayedQueue.getDueEventCount();

            expect(result).toBe(5);
            expect(mockRedisClient.zcount).toHaveBeenCalledWith(
                'delayed_queue',
                '-inf',
                expect.any(String) // now timestamp
            );
        });
    });

    describe('reAddToQueue', () => {
        it('should release claim and re-add event with delay offset', async () => {
            const event = createMockDelayedNotification();
            const delayMs = 5000;

            const beforeTime = Date.now();
            await delayedQueue.reAddToQueue(event, delayMs);
            const afterTime = Date.now();

            // Should delete the claim key first
            expect(mockRedisClient.del).toHaveBeenCalled();

            expect(mockRedisClient.zadd).toHaveBeenCalled();
            const callArgs = mockRedisClient.zadd.mock.calls[0];
            const score = callArgs[1];

            // Score should be now + delay
            expect(score).toBeGreaterThanOrEqual(beforeTime + delayMs);
            expect(score).toBeLessThanOrEqual(afterTime + delayMs);
        });

        it('should use default delay of 5000ms', async () => {
            const event = createMockDelayedNotification();

            const beforeTime = Date.now();
            await delayedQueue.reAddToQueue(event);
            const afterTime = Date.now();

            const callArgs = mockRedisClient.zadd.mock.calls[0];
            const score = callArgs[1];

            expect(score).toBeGreaterThanOrEqual(beforeTime + 5000);
            expect(score).toBeLessThanOrEqual(afterTime + 5000);
        });
    });
});
