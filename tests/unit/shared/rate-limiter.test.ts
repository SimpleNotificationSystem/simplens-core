/**
 * Unit Tests for Rate Limiter Module
 * Tests token bucket rate limiting with mocked Redis
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CHANNEL } from '../../../src/types/types.js';

// Mock Redis client
const mockRedisClient = {
    get: vi.fn(),
    set: vi.fn(),
    mget: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
};

vi.mock('../../../src/config/redis.config.js', () => ({
    getRedisClient: () => mockRedisClient,
}));

vi.mock('../../../src/config/env.config.js', () => ({
    env: {
        EMAIL_RATE_LIMIT_TOKENS: 100,
        EMAIL_RATE_LIMIT_REFILL_RATE: 10,
        WHATSAPP_RATE_LIMIT_TOKENS: 50,
        WHATSAPP_RATE_LIMIT_REFILL_RATE: 5,
    },
}));

describe('Rate Limiter Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('consumeToken', () => {
        it('should return allowed: true when tokens are available', async () => {
            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');

            // Mock: Lua script returns [1, 99] meaning allowed with 99 remaining
            mockRedisClient.eval.mockResolvedValue([1, 99]);

            const result = await consumeToken(CHANNEL.email);

            expect(result.allowed).toBe(true);
            expect(result.remainingTokens).toBe(99);
            expect(result.retryAfterMs).toBeUndefined();
        });

        it('should return allowed: false when rate limited', async () => {
            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');

            // Mock: Lua script returns [0, 0, 100] meaning denied, 0 tokens, retry in 100ms
            mockRedisClient.eval.mockResolvedValue([0, 0, 100]);

            const result = await consumeToken(CHANNEL.email);

            expect(result.allowed).toBe(false);
            expect(result.remainingTokens).toBe(0);
            expect(result.retryAfterMs).toBe(100);
        });

        it('should use email config for email channel', async () => {
            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');

            mockRedisClient.eval.mockResolvedValue([1, 99]);

            await consumeToken(CHANNEL.email);

            // Verify the Lua script was called with email configuration
            // eval(script, numKeys, key1, key2, arg1, arg2, arg3)
            // arg1=maxTokens, arg2=refillRate, arg3=now
            expect(mockRedisClient.eval).toHaveBeenCalled();
            const callArgs = mockRedisClient.eval.mock.calls[0];
            expect(callArgs[4]).toBe('100'); // maxTokens for email (ARGV[1])
            expect(callArgs[5]).toBe('10');  // refillRate for email (ARGV[2])
        });

        it('should use whatsapp config for whatsapp channel', async () => {
            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');

            mockRedisClient.eval.mockResolvedValue([1, 49]);

            await consumeToken(CHANNEL.whatsapp);

            const callArgs = mockRedisClient.eval.mock.calls[0];
            expect(callArgs[4]).toBe('50'); // maxTokens for whatsapp
            expect(callArgs[5]).toBe('5');  // refillRate for whatsapp
        });
    });

    describe('getTokenCount', () => {
        it('should return max tokens when no record exists', async () => {
            const { getTokenCount } = await import('../../../src/processors/shared/rate-limiter.js');

            // No existing keys
            mockRedisClient.mget.mockResolvedValue([null, null]);

            const count = await getTokenCount(CHANNEL.email);

            expect(count).toBe(100); // EMAIL_RATE_LIMIT_TOKENS
        });

        it('should return current token count from Redis', async () => {
            const { getTokenCount } = await import('../../../src/processors/shared/rate-limiter.js');

            const now = Date.now();
            // Current tokens = 50, last refill = now (no time passed)
            mockRedisClient.mget.mockResolvedValue(['50', now.toString()]);

            const count = await getTokenCount(CHANNEL.email);

            // Should be approximately 50 (may have slight variation due to timing)
            expect(count).toBeGreaterThanOrEqual(50);
            expect(count).toBeLessThanOrEqual(100);
        });

        it('should account for token refill over time', async () => {
            const { getTokenCount } = await import('../../../src/processors/shared/rate-limiter.js');

            // 1 second ago with 50 tokens, refill rate of 10/sec
            const oneSecondAgo = Date.now() - 1000;
            mockRedisClient.mget.mockResolvedValue(['50', oneSecondAgo.toString()]);

            const count = await getTokenCount(CHANNEL.email);

            // Should be 50 + 10 = 60 (approximately)
            expect(count).toBeGreaterThanOrEqual(59);
            expect(count).toBeLessThanOrEqual(61);
        });
    });

    describe('resetRateLimiter', () => {
        it('should delete rate limiter keys from Redis', async () => {
            const { resetRateLimiter } = await import('../../../src/processors/shared/rate-limiter.js');

            mockRedisClient.del.mockResolvedValue(2);

            await resetRateLimiter(CHANNEL.email);

            expect(mockRedisClient.del).toHaveBeenCalledWith(
                'ratelimit:tokens:email',
                'ratelimit:last_refill:email'
            );
        });
    });
});
