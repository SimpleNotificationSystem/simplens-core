/**
 * Token Bucket Rate Limiter using Redis
 * Controls the rate at which notifications are sent to external services
 * 
 * Gets rate limit configuration from plugins or environment defaults.
 */

import { getRedisClient } from '@src/config/redis.config.js';
import { env } from '@src/config/env.config.js';
import { getRateLimitConfig as getPluginRateLimitConfig } from '@src/plugins/index.js';

// Redis key prefixes
const TOKENS_KEY_PREFIX = 'ratelimit:tokens';
const LAST_REFILL_KEY_PREFIX = 'ratelimit:last_refill';

/** Time interval for refill rate */
type RefillInterval = 'second' | 'minute' | 'hour' | 'day';

interface RateLimitConfig {
    maxTokens: number;
    refillRate: number;
    refillInterval?: RefillInterval;
}

// Conversion divisors to convert rate to per-second
const INTERVAL_TO_SECONDS: Record<RefillInterval, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
};

/**
 * Normalize refill rate to tokens per second
 * Converts interval-based rates (e.g., 500/day) to per-second rates
 */
function normalizeRefillRate(config: RateLimitConfig): number {
    const interval = config.refillInterval || 'second';
    const divisor = INTERVAL_TO_SECONDS[interval] || 1;
    return config.refillRate / divisor;
}

// Default rate limit config
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
    maxTokens: 100,
    refillRate: 10,
    refillInterval: 'second',
};

/**
 * Get rate limit configuration for a provider
 * Priority: Plugin config > Default
 */
const getConfig = (providerId: string): RateLimitConfig => {
    // Try plugin registry first
    const pluginConfig = getPluginRateLimitConfig(providerId);
    if (pluginConfig) {
        return pluginConfig;
    }

    // Default config for all providers
    return DEFAULT_RATE_LIMIT;
};

/**
 * Build Redis keys for a provider
 */
const buildKeys = (providerId: string): { tokensKey: string; lastRefillKey: string } => {
    return {
        tokensKey: `${TOKENS_KEY_PREFIX}:${providerId}`,
        lastRefillKey: `${LAST_REFILL_KEY_PREFIX}:${providerId}`
    };
};

/**
 * Token Bucket Algorithm Result
 */
export interface RateLimitResult {
    allowed: boolean;
    remainingTokens: number;
    retryAfterMs?: number;
}

/**
 * Try to consume a token from the bucket
 * Uses Redis Lua script for atomic operation
 */
export const consumeToken = async (providerId: string): Promise<RateLimitResult> => {
    const redis = getRedisClient();
    const config = getConfig(providerId);
    const normalizedRate = normalizeRefillRate(config);
    const { tokensKey, lastRefillKey } = buildKeys(providerId);

    // Debug logging
    console.log(`[RateLimiter] Provider: ${providerId}, Config: maxTokens=${config.maxTokens}, refillRate=${config.refillRate}/${config.refillInterval || 'second'} (normalized: ${normalizedRate.toFixed(6)}/sec)`);

    const now = Date.now();

    // Lua script for atomic token bucket operation
    const luaScript = `
        local tokens_key = KEYS[1]
        local last_refill_key = KEYS[2]
        local max_tokens = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        
        -- Get current state
        local current_tokens = tonumber(redis.call('GET', tokens_key)) or max_tokens
        local last_refill = tonumber(redis.call('GET', last_refill_key)) or now
        
        -- Calculate tokens to add based on elapsed time
        local elapsed_seconds = (now - last_refill) / 1000
        local tokens_to_add = elapsed_seconds * refill_rate
        local new_tokens = math.min(current_tokens + tokens_to_add, max_tokens)
        
        -- Try to consume a token
        if new_tokens >= 1 then
            new_tokens = new_tokens - 1
            redis.call('SET', tokens_key, new_tokens)
            redis.call('SET', last_refill_key, now)
            return { 1, new_tokens }  -- allowed, remaining
        else
            -- Calculate time until next token available
            local time_for_one_token = 1000 / refill_rate  -- ms
            local deficit = 1 - new_tokens
            local wait_time = deficit * time_for_one_token
            return { 0, new_tokens, wait_time }  -- denied, remaining, wait_time
        end
    `;

    const result = await redis.eval(
        luaScript,
        2,
        tokensKey,
        lastRefillKey,
        config.maxTokens.toString(),
        normalizedRate.toString(),
        now.toString()
    ) as [number, number, number?];

    const [allowed, remainingTokens, retryAfterMs] = result;

    return {
        allowed: allowed === 1,
        remainingTokens: Math.floor(remainingTokens),
        retryAfterMs: retryAfterMs ? Math.ceil(retryAfterMs) : undefined
    };
};

/**
 * Get current token count without consuming
 */
export const getTokenCount = async (providerId: string): Promise<number> => {
    const redis = getRedisClient();
    const config = getConfig(providerId);
    const normalizedRate = normalizeRefillRate(config);
    const { tokensKey, lastRefillKey } = buildKeys(providerId);

    const now = Date.now();

    const [tokensStr, lastRefillStr] = await redis.mget(tokensKey, lastRefillKey);

    const currentTokens = tokensStr ? parseFloat(tokensStr) : config.maxTokens;
    const lastRefill = lastRefillStr ? parseInt(lastRefillStr) : now;

    const elapsedSeconds = (now - lastRefill) / 1000;
    const tokensToAdd = elapsedSeconds * normalizedRate;

    return Math.min(currentTokens + tokensToAdd, config.maxTokens);
};

/**
 * Reset rate limiter for a provider (for testing)
 */
export const resetRateLimiter = async (providerId: string): Promise<void> => {
    const redis = getRedisClient();
    const { tokensKey, lastRefillKey } = buildKeys(providerId);

    await redis.del(tokensKey, lastRefillKey);
};
