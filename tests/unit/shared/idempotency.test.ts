/**
 * Unit Tests for Idempotency Module
 * Tests Redis-based idempotency checking with mocked Redis
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';

// Mock Redis config before importing the module
const mockRedisClient = {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    eval: vi.fn(),
    del: vi.fn(),
};

vi.mock('../../../src/config/redis.config.js', () => ({
    getRedisClient: () => mockRedisClient,
}));

vi.mock('../../../src/config/env.config.js', () => ({
    env: {
        PROCESSING_TTL_SECONDS: 120,
        IDEMPOTENCY_TTL_SECONDS: 86400,
    },
}));

describe('Idempotency Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('tryAcquireProcessingLock', () => {
        it('should return canProcess: true for first-time processing', async () => {
            const { tryAcquireProcessingLock } = await import('../../../src/processors/shared/idempotency.js');

            // Mock: no existing record, lock acquired successfully
            mockRedisClient.eval.mockResolvedValue(1);

            const result = await tryAcquireProcessingLock('notification-123');

            expect(result.canProcess).toBe(true);
            expect(result.isRetry).toBe(false);
            expect(mockRedisClient.eval).toHaveBeenCalled();
        });

        it('should return canProcess: true, isRetry: true for retry after failure', async () => {
            const { tryAcquireProcessingLock } = await import('../../../src/processors/shared/idempotency.js');

            // Mock: was failed, retry allowed
            mockRedisClient.eval.mockResolvedValue(2);

            const result = await tryAcquireProcessingLock('notification-123');

            expect(result.canProcess).toBe(true);
            expect(result.isRetry).toBe(true);
        });

        it('should return canProcess: false when already delivered', async () => {
            const { tryAcquireProcessingLock } = await import('../../../src/processors/shared/idempotency.js');

            // Mock: already delivered or processing
            mockRedisClient.eval.mockResolvedValue(0);

            const result = await tryAcquireProcessingLock('notification-123');

            expect(result.canProcess).toBe(false);
        });

        it('should return canProcess: false when already processing', async () => {
            const { tryAcquireProcessingLock } = await import('../../../src/processors/shared/idempotency.js');

            mockRedisClient.eval.mockResolvedValue(0);

            const result = await tryAcquireProcessingLock('notification-456');

            expect(result.canProcess).toBe(false);
        });
    });

    describe('setDelivered', () => {
        it('should mark notification as delivered with long TTL', async () => {
            const { setDelivered } = await import('../../../src/processors/shared/idempotency.js');

            mockRedisClient.setex.mockResolvedValue('OK');

            await setDelivered('notification-123');

            expect(mockRedisClient.setex).toHaveBeenCalledWith(
                'idempotency:notification-123',
                86400, // IDEMPOTENCY_TTL_SECONDS
                expect.stringContaining('"status":"delivered"')
            );
        });

        it('should include updated_at timestamp', async () => {
            const { setDelivered } = await import('../../../src/processors/shared/idempotency.js');

            mockRedisClient.setex.mockResolvedValue('OK');

            await setDelivered('notification-123');

            const callArgs = mockRedisClient.setex.mock.calls[0];
            const storedValue = JSON.parse(callArgs[2]);

            expect(storedValue.status).toBe('delivered');
            expect(storedValue.updated_at).toBeDefined();
        });
    });

    describe('setFailed', () => {
        it('should mark notification as failed to allow retries', async () => {
            const { setFailed } = await import('../../../src/processors/shared/idempotency.js');

            mockRedisClient.setex.mockResolvedValue('OK');

            await setFailed('notification-123');

            expect(mockRedisClient.setex).toHaveBeenCalledWith(
                'idempotency:notification-123',
                86400,
                expect.stringContaining('"status":"failed"')
            );
        });
    });

    describe('getIdempotencyStatus', () => {
        it('should return null when no record exists', async () => {
            const { getIdempotencyStatus } = await import('../../../src/processors/shared/idempotency.js');

            mockRedisClient.get.mockResolvedValue(null);

            const result = await getIdempotencyStatus('notification-123');

            expect(result).toBeNull();
        });

        it('should return parsed status when record exists', async () => {
            const { getIdempotencyStatus } = await import('../../../src/processors/shared/idempotency.js');

            const record = {
                status: 'delivered',
                updated_at: new Date().toISOString(),
            };
            mockRedisClient.get.mockResolvedValue(JSON.stringify(record));

            const result = await getIdempotencyStatus('notification-123');

            expect(result).toEqual(record);
        });

        it('should return null for invalid JSON', async () => {
            const { getIdempotencyStatus } = await import('../../../src/processors/shared/idempotency.js');

            mockRedisClient.get.mockResolvedValue('invalid-json');

            const result = await getIdempotencyStatus('notification-123');

            expect(result).toBeNull();
        });
    });

});
