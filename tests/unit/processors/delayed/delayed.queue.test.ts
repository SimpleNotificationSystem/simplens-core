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
};

// Mock Redis config
vi.mock('@src/config/redis.config.js', () => ({
    getRedisClient: vi.fn(() => mockRedisClient),
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

    describe('fetchDueEvents', () => {
        it('should execute Lua script for atomic fetch and remove', async () => {
            mockRedisClient.eval.mockResolvedValue([]);

            await delayedQueue.fetchDueEvents(10);

            expect(mockRedisClient.eval).toHaveBeenCalledWith(
                expect.stringContaining('ZRANGEBYSCORE'),
                1,
                'delayed_queue',
                expect.any(String), // now timestamp
                '10' // limit
            );
        });

        it('should return empty array when no events are due', async () => {
            mockRedisClient.eval.mockResolvedValue([]);

            const result = await delayedQueue.fetchDueEvents(10);

            expect(result).toEqual([]);
        });

        it('should parse and return due events', async () => {
            const event = createMockDelayedNotification();
            // Convert ObjectId to string for JSON serialization
            const eventForJson = {
                ...event,
                notification_id: event.notification_id.toString(),
            };
            mockRedisClient.eval.mockResolvedValue([JSON.stringify(eventForJson)]);

            const result = await delayedQueue.fetchDueEvents(10);

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

            const result = await delayedQueue.fetchDueEvents(10);

            expect(result).toHaveLength(2);
        });

        it('should skip malformed JSON entries', async () => {
            const validEvent = createMockDelayedNotification();
            const validEventForJson = { ...validEvent, notification_id: validEvent.notification_id.toString() };
            mockRedisClient.eval.mockResolvedValue([
                'invalid-json',
                JSON.stringify(validEventForJson),
            ]);

            const result = await delayedQueue.fetchDueEvents(10);

            expect(result).toHaveLength(1);
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
        it('should re-add event with delay offset', async () => {
            const event = createMockDelayedNotification();
            const delayMs = 5000;

            const beforeTime = Date.now();
            await delayedQueue.reAddToQueue(event, delayMs);
            const afterTime = Date.now();

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
