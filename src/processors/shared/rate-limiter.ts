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

interface RateLimitConfig {
    maxTokens: number;
    refillRate: number; // tokens per second
}

// Default rate limit config
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
    maxTokens: 100,
    refillRate: 10,
};

/**
 * Get rate limit configuration for a channel
 * Priority: Plugin config > Default
 */
const getConfig = (channel: string): RateLimitConfig => {
    // Try plugin registry first
    const pluginConfig = getPluginRateLimitConfig(channel);
    if (pluginConfig) {
        return pluginConfig;
    }

    // Default config for all channels
    return DEFAULT_RATE_LIMIT;
};

/**
 * Build Redis keys for a channel
 */
const buildKeys = (channel: string): { tokensKey: string; lastRefillKey: string } => {
    return {
        tokensKey: `${TOKENS_KEY_PREFIX}:${channel}`,
        lastRefillKey: `${LAST_REFILL_KEY_PREFIX}:${channel}`
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
export const consumeToken = async (channel: string): Promise<RateLimitResult> => {
    const redis = getRedisClient();
    const config = getConfig(channel);
    const { tokensKey, lastRefillKey } = buildKeys(channel);

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
        config.refillRate.toString(),
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
export const getTokenCount = async (channel: string): Promise<number> => {
    const redis = getRedisClient();
    const config = getConfig(channel);
    const { tokensKey, lastRefillKey } = buildKeys(channel);

    const now = Date.now();

    const [tokensStr, lastRefillStr] = await redis.mget(tokensKey, lastRefillKey);

    const currentTokens = tokensStr ? parseFloat(tokensStr) : config.maxTokens;
    const lastRefill = lastRefillStr ? parseInt(lastRefillStr) : now;

    const elapsedSeconds = (now - lastRefill) / 1000;
    const tokensToAdd = elapsedSeconds * config.refillRate;

    return Math.min(currentTokens + tokensToAdd, config.maxTokens);
};

/**
 * Reset rate limiter for a channel (for testing)
 */
export const resetRateLimiter = async (channel: string): Promise<void> => {
    const redis = getRedisClient();
    const { tokensKey, lastRefillKey } = buildKeys(channel);

    await redis.del(tokensKey, lastRefillKey);
};
