/**
 * Unit Tests for Rate Limiter Module
 * Tests token bucket rate limiting with mocked Redis
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
        RATE_LIMIT_RETRY_DELAY_MS: 5000,
        EMAIL_RATE_LIMIT_TOKENS: 100,
        EMAIL_RATE_LIMIT_REFILL_RATE: 10,
        WHATSAPP_RATE_LIMIT_TOKENS: 50,
        WHATSAPP_RATE_LIMIT_REFILL_RATE: 5,
    },
}));

vi.mock('../../../src/database/models/provider.models.js', () => ({
    default: {
        find: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                    {
                        id: 'email-provider',
                        channel: 'email',
                        plugin_name: 'nodemailer-gmail',
                        enabled: true,
                    },
                    {
                        id: 'sms-provider',
                        channel: 'sms',
                        plugin_name: 'twilio-sms',
                        enabled: true,
                    },
                ]),
            }),
        }),
    },
}));

describe('Rate Limiter Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('consumeToken', () => {
        it('should return allowed: true when tokens are available', async () => {
            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');

            // Mock: Lua script returns [1, 99, 0] meaning allowed with 99 remaining
            mockRedisClient.eval.mockResolvedValue([1, 99, 0]);

            const result = await consumeToken('email');

            expect(result.allowed).toBe(true);
            expect(result.remainingTokens).toBe(99);
            expect(result.retryAfterMs).toBeUndefined();
        });

        it('should return allowed: false with fixed retry delay when rate limited', async () => {
            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');

            // Mock: Lua script returns [0, 0, 5000] meaning denied, 0 tokens, retry in 5000ms
            mockRedisClient.eval.mockResolvedValue([0, 0, 5000]);

            const result = await consumeToken('email');

            expect(result.allowed).toBe(false);
            expect(result.remainingTokens).toBe(0);
            expect(result.retryAfterMs).toBe(5000);
        });

        it('should use cluster-safe hash tag keys for Redis evaluation', async () => {
            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');

            mockRedisClient.eval.mockResolvedValue([1, 99, 0]);

            await consumeToken('email');

            expect(mockRedisClient.eval).toHaveBeenCalled();
            const callArgs = mockRedisClient.eval.mock.calls[0];
            expect(callArgs[1]).toBe(4); // 4 keys passed
            expect(callArgs[2]).toBe('ratelimit:{email}:tokens');
            expect(callArgs[3]).toBe('ratelimit:{email}:last_refill');
            expect(callArgs[4]).toBe('ratelimit:{email}:exhausted_count');
            expect(callArgs[5]).toBe('ratelimit:{email}:last_exhausted');
            expect(callArgs[6]).toBe('100'); // maxTokens
            expect(callArgs[7]).toBe('10');  // refillRate
            expect(callArgs[9]).toBe('5000'); // retry delay
        });
    });

    describe('getTokenCount', () => {
        it('should return max tokens when no record exists', async () => {
            const { getTokenCount } = await import('../../../src/processors/shared/rate-limiter.js');

            mockRedisClient.mget.mockResolvedValue([null, null]);

            const count = await getTokenCount('email');

            expect(count).toBe(100);
        });

        it('should return current token count from Redis', async () => {
            const { getTokenCount } = await import('../../../src/processors/shared/rate-limiter.js');

            const now = Date.now();
            mockRedisClient.mget.mockResolvedValue(['50', now.toString()]);

            const count = await getTokenCount('email');

            expect(count).toBeGreaterThanOrEqual(50);
            expect(count).toBeLessThanOrEqual(100);
        });

        it('should account for token refill over time', async () => {
            const { getTokenCount } = await import('../../../src/processors/shared/rate-limiter.js');

            const oneSecondAgo = Date.now() - 1000;
            mockRedisClient.mget.mockResolvedValue(['50', oneSecondAgo.toString()]);

            const count = await getTokenCount('email');

            expect(count).toBeGreaterThanOrEqual(59);
            expect(count).toBeLessThanOrEqual(61);
        });
    });

    describe('getAllProvidersRateLimitStatus', () => {
        it('should batch query Redis and return calculated metrics across providers', async () => {
            const { getAllProvidersRateLimitStatus, clearRateLimitStatusCache } = await import(
                '../../../src/processors/shared/rate-limiter.js'
            );
            clearRateLimitStatusCache();

            const now = Date.now();
            // Provider 1 (email-provider): 70 tokens, refilled now, 0 exhausted
            // Provider 2 (sms-provider): 0 tokens, refilled now, 3 exhausted, last exhausted now
            mockRedisClient.mget.mockResolvedValue([
                '70',
                now.toString(),
                '0',
                null,
                '0',
                now.toString(),
                '3',
                now.toString(),
            ]);

            const response = await getAllProvidersRateLimitStatus();

            expect(response.providers.length).toBe(2);
            expect(response.summary.total_providers).toBe(2);
            expect(response.summary.exhausted_providers).toBe(1);
            expect(response.summary.healthy_providers).toBe(1);

            const p1 = response.providers.find((p) => p.provider_id === 'email-provider');
            expect(p1).toBeDefined();
            expect(p1?.status.remaining_tokens).toBe(70);
            expect(p1?.status.used_tokens).toBe(30);
            expect(p1?.status.usage_percentage).toBe(30);
            expect(p1?.status.is_exhausted).toBe(false);

            const p2 = response.providers.find((p) => p.provider_id === 'sms-provider');
            expect(p2).toBeDefined();
            expect(p2?.status.remaining_tokens).toBe(0);
            expect(p2?.status.used_tokens).toBe(100);
            expect(p2?.status.usage_percentage).toBe(100);
            expect(p2?.status.is_exhausted).toBe(true);
            expect(p2?.status.resets_in_ms).toBeGreaterThan(0);
            expect(p2?.status.exhausted_count).toBe(3);
        });

        it('should debounce subsequent requests within CACHE_TTL_MS', async () => {
            const { getAllProvidersRateLimitStatus, clearRateLimitStatusCache } = await import(
                '../../../src/processors/shared/rate-limiter.js'
            );
            clearRateLimitStatusCache();

            mockRedisClient.mget.mockResolvedValue([null, null, null, null, null, null, null, null]);

            await getAllProvidersRateLimitStatus();
            await getAllProvidersRateLimitStatus();

            // MGET should only have been called once due to in-memory cache
            expect(mockRedisClient.mget).toHaveBeenCalledTimes(1);
        });
    });

    describe('resetRateLimiter', () => {
        it('should delete both hash-tagged and legacy rate limiter keys from Redis', async () => {
            const { resetRateLimiter } = await import('../../../src/processors/shared/rate-limiter.js');

            mockRedisClient.del.mockResolvedValue(5);

            await resetRateLimiter('email');

            expect(mockRedisClient.del).toHaveBeenCalledWith(
                'ratelimit:{email}:tokens',
                'ratelimit:{email}:last_refill',
                'ratelimit:{email}:queue_position',
                'ratelimit:{email}:exhausted_count',
                'ratelimit:{email}:last_exhausted',
                'ratelimit:tokens:email',
                'ratelimit:last_refill:email',
                'ratelimit:queue_position:email'
            );
        });
    });

    describe('refillInterval normalization', () => {
        beforeEach(() => {
            vi.resetModules();
        });

        it('should normalize refillInterval: minute to per-second rate', async () => {
            vi.doMock('../../../src/plugins/index.js', () => ({
                getRateLimitConfig: vi.fn().mockReturnValue({
                    maxTokens: 60,
                    refillRate: 60,
                    refillInterval: 'minute',
                }),
            }));

            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');
            mockRedisClient.eval.mockResolvedValue([1, 59, 0]);

            await consumeToken('test-provider');

            const callArgs = mockRedisClient.eval.mock.calls[0];
            expect(callArgs[6]).toBe('60'); // maxTokens
            expect(callArgs[7]).toBe('1');  // 60/minute = 1/second
        });

        it('should normalize refillInterval: hour to per-second rate', async () => {
            vi.doMock('../../../src/plugins/index.js', () => ({
                getRateLimitConfig: vi.fn().mockReturnValue({
                    maxTokens: 3600,
                    refillRate: 3600,
                    refillInterval: 'hour',
                }),
            }));

            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');
            mockRedisClient.eval.mockResolvedValue([1, 3599, 0]);

            await consumeToken('test-provider');

            const callArgs = mockRedisClient.eval.mock.calls[0];
            expect(callArgs[6]).toBe('3600'); // maxTokens
            expect(callArgs[7]).toBe('1');    // 3600/hour = 1/second
        });

        it('should normalize refillInterval: day to per-second rate', async () => {
            vi.doMock('../../../src/plugins/index.js', () => ({
                getRateLimitConfig: vi.fn().mockReturnValue({
                    maxTokens: 500,
                    refillRate: 500,
                    refillInterval: 'day',
                }),
            }));

            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');
            mockRedisClient.eval.mockResolvedValue([1, 499, 0]);

            await consumeToken('test-provider');

            const callArgs = mockRedisClient.eval.mock.calls[0];
            expect(callArgs[6]).toBe('500'); // maxTokens
            const normalizedRate = parseFloat(callArgs[7]);
            expect(normalizedRate).toBeCloseTo(500 / 86400, 5);
        });

        it('should default to second when refillInterval not specified', async () => {
            vi.doMock('../../../src/plugins/index.js', () => ({
                getRateLimitConfig: vi.fn().mockReturnValue({
                    maxTokens: 100,
                    refillRate: 10,
                }),
            }));

            const { consumeToken } = await import('../../../src/processors/shared/rate-limiter.js');
            mockRedisClient.eval.mockResolvedValue([1, 99, 0]);

            await consumeToken('test-provider');

            const callArgs = mockRedisClient.eval.mock.calls[0];
            expect(callArgs[6]).toBe('100'); // maxTokens
            expect(callArgs[7]).toBe('10');  // 10/second
        });
    });
});
