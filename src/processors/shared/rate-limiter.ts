/**
 * Token Bucket Rate Limiter using Redis
 * Controls the rate at which notifications are sent to external services
 * 
 * Gets rate limit configuration from plugins or environment defaults.
 */

import { getRedisClient } from '@src/config/redis.config.js';
import { env } from '@src/config/env.config.js';
import { getRateLimitConfig as getPluginRateLimitConfig } from '@src/plugins/index.js';
import { PluginRegistry } from '@src/plugins/loader/registry.js';
import Provider from '@src/database/models/provider.models.js';
import { rateLimiterLogger as logger } from '@src/workers/utils/logger.js';
import type {
    RateLimitConfig,
    RefillInterval,
    RateLimitResult,
    ProviderRateLimitStatus,
    ProviderRateLimitListResponse,
} from '@src/types/types.js';

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
export function normalizeRefillRate(config: RateLimitConfig): number {
    const interval = config.refillInterval || 'second';
    const divisor = INTERVAL_TO_SECONDS[interval] || 1;
    return config.refillRate / divisor;
}

// Default rate limit config
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
    maxTokens: 100,
    refillRate: 10,
    refillInterval: 'second',
};

/**
 * Get rate limit configuration for a provider
 * Priority: Plugin config > Default
 */
export const getConfig = (providerId: string): RateLimitConfig => {
    // Try plugin registry first
    const pluginConfig = getPluginRateLimitConfig(providerId);
    if (pluginConfig) {
        return pluginConfig;
    }

    // Default config for all providers
    return DEFAULT_RATE_LIMIT;
};

/**
 * Build Redis keys for a provider using Redis Cluster hash tags {providerId}
 */
export const buildKeys = (providerId: string): {
    tokensKey: string;
    lastRefillKey: string;
    queueKey: string;
    exhaustedCountKey: string;
    lastExhaustedKey: string;
} => {
    return {
        tokensKey: `ratelimit:{${providerId}}:tokens`,
        lastRefillKey: `ratelimit:{${providerId}}:last_refill`,
        queueKey: `ratelimit:{${providerId}}:queue_position`,
        exhaustedCountKey: `ratelimit:{${providerId}}:exhausted_count`,
        lastExhaustedKey: `ratelimit:{${providerId}}:last_exhausted`,
    };
};

// In-memory status response cache to debounce high-frequency dashboard queries
let cachedStatusResponse: { data: ProviderRateLimitListResponse; timestamp: number } | null = null;
const CACHE_TTL_MS = 1000; // 1 second

/**
 * Clear the in-memory rate limit status cache
 */
export const clearRateLimitStatusCache = (): void => {
    cachedStatusResponse = null;
};

/**
 * Try to consume a token from the bucket
 * Uses Redis Lua script for atomic operation with fixed retry delay
 */
export const consumeToken = async (providerId: string): Promise<RateLimitResult> => {
    const redis = getRedisClient();
    const config = getConfig(providerId);
    const normalizedRate = normalizeRefillRate(config);
    const { tokensKey, lastRefillKey, exhaustedCountKey, lastExhaustedKey } = buildKeys(providerId);
    const fixedRetryDelay = env.RATE_LIMIT_RETRY_DELAY_MS;

    // Debug logging
    logger.debug(`Provider: ${providerId}, Config: maxTokens=${config.maxTokens}, refillRate=${config.refillRate}/${config.refillInterval || 'second'} (normalized: ${normalizedRate.toFixed(6)}/sec), retryDelay=${fixedRetryDelay}ms`);

    const now = Date.now();
    // Rolling TTL: 7 days or at least 2x the duration needed to refill from 0 to full capacity
    const ttlSeconds = Math.max(86400 * 7, Math.ceil((config.maxTokens / Math.max(normalizedRate, 0.0001)) * 2));

    // Lua script for atomic token bucket operation with cluster-safe hash tag keys & telemetry
    const luaScript = `
        local tokens_key = KEYS[1]
        local last_refill_key = KEYS[2]
        local exhausted_count_key = KEYS[3]
        local last_exhausted_key = KEYS[4]
        local max_tokens = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local fixed_retry_delay = tonumber(ARGV[4])
        local ttl_seconds = tonumber(ARGV[5])
        
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
            redis.call('SET', tokens_key, new_tokens, 'EX', ttl_seconds)
            redis.call('SET', last_refill_key, now, 'EX', ttl_seconds)
            return { 1, new_tokens, 0 }
        else
            redis.call('INCR', exhausted_count_key)
            redis.call('EXPIRE', exhausted_count_key, ttl_seconds)
            redis.call('SET', last_exhausted_key, now, 'EX', ttl_seconds)
            return { 0, new_tokens, fixed_retry_delay }
        end
    `;

    const result = await redis.eval(
        luaScript,
        4,
        tokensKey,
        lastRefillKey,
        exhaustedCountKey,
        lastExhaustedKey,
        config.maxTokens.toString(),
        normalizedRate.toString(),
        now.toString(),
        fixedRetryDelay.toString(),
        ttlSeconds.toString()
    ) as [number, number, number];

    const [allowed, remainingTokens, retryAfterMs] = result;

    return {
        allowed: allowed === 1,
        remainingTokens: Math.floor(remainingTokens),
        retryAfterMs: retryAfterMs > 0 ? Math.ceil(retryAfterMs) : undefined,
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
    const lastRefill = lastRefillStr ? parseInt(lastRefillStr, 10) : now;

    const elapsedSeconds = (now - lastRefill) / 1000;
    const tokensToAdd = elapsedSeconds * normalizedRate;

    return Math.min(currentTokens + tokensToAdd, config.maxTokens);
};

interface ProviderBasicMeta {
    id: string;
    channel: string;
    plugin_name: string;
    display_name?: string;
    enabled: boolean;
}

/**
 * Fetch all provider rate limit statuses at scale using batched Redis MGET
 */
export const getAllProvidersRateLimitStatus = async (): Promise<ProviderRateLimitListResponse> => {
    const now = Date.now();

    // Check in-memory cache to debounce frequent dashboard requests
    if (cachedStatusResponse && (now - cachedStatusResponse.timestamp) < CACHE_TTL_MS) {
        return cachedStatusResponse.data;
    }

    const providerMap = new Map<string, ProviderBasicMeta>();

    // 1. Gather providers from Database (primary)
    try {
        const dbProviders = await Provider.find().sort({ channel: 1, 'options.priority': -1 }).lean();
        for (const p of dbProviders) {
            providerMap.set(p.id, {
                id: p.id,
                channel: p.channel,
                plugin_name: p.plugin_name,
                display_name: p.id,
                enabled: p.enabled !== false,
            });
        }
    } catch {
        // If MongoDB query fails or is not connected, continue to registry fallback
    }

    // 2. Supplement/fallback from PluginRegistry
    try {
        const registered = PluginRegistry.getAllRegistered();
        for (const r of registered) {
            if (!providerMap.has(r.id)) {
                providerMap.set(r.id, {
                    id: r.id,
                    channel: r.provider.manifest.channel,
                    plugin_name: r.provider.manifest.name,
                    display_name: r.provider.manifest.displayName || r.id,
                    enabled: true,
                });
            } else {
                const existing = providerMap.get(r.id)!;
                if (r.provider.manifest.displayName) {
                    existing.display_name = r.provider.manifest.displayName;
                }
            }
        }
    } catch {
        // Registry check safe fallback
    }

    const providersList = Array.from(providerMap.values());

    if (providersList.length === 0) {
        const emptyResponse: ProviderRateLimitListResponse = {
            providers: [],
            summary: {
                total_providers: 0,
                exhausted_providers: 0,
                healthy_providers: 0,
            },
        };
        cachedStatusResponse = { data: emptyResponse, timestamp: now };
        return emptyResponse;
    }

    // 3. Build batched Redis keys for single MGET round-trip
    const redis = getRedisClient();
    const allKeys: string[] = [];

    for (const p of providersList) {
        const { tokensKey, lastRefillKey, exhaustedCountKey, lastExhaustedKey } = buildKeys(p.id);
        allKeys.push(tokensKey, lastRefillKey, exhaustedCountKey, lastExhaustedKey);
    }

    let mgetResults: (string | null)[];
    try {
        mgetResults = await redis.mget(...allKeys);
    } catch (redisErr) {
        logger.error('Failed to batch query Redis for provider rate limits:', redisErr);
        mgetResults = new Array(allKeys.length).fill(null);
    }

    // 4. Derive metrics in application memory (O(N) with no write contention)
    const providersStatus: ProviderRateLimitStatus[] = [];
    let exhaustedCount = 0;

    for (let i = 0; i < providersList.length; i++) {
        const p = providersList[i];
        const config = getConfig(p.id);
        const normalizedRate = normalizeRefillRate(config);
        const maxTokens = config.maxTokens;

        const tokensStr = mgetResults[i * 4];
        const lastRefillStr = mgetResults[i * 4 + 1];
        const exhaustedCountStr = mgetResults[i * 4 + 2];
        const lastExhaustedStr = mgetResults[i * 4 + 3];

        const currentTokens = tokensStr !== null && tokensStr !== undefined ? parseFloat(tokensStr) : maxTokens;
        const lastRefill = lastRefillStr ? parseInt(lastRefillStr, 10) : now;
        const elapsedSeconds = Math.max(0, (now - lastRefill) / 1000);
        const tokensToAdd = elapsedSeconds * normalizedRate;
        const rawRemaining = Math.min(maxTokens, currentTokens + tokensToAdd);

        const remainingTokens = Math.min(maxTokens, Math.max(0, Math.round(rawRemaining * 10) / 10));
        const usedTokens = Math.max(0, Math.round((maxTokens - remainingTokens) * 10) / 10);
        const usagePercentage = maxTokens > 0 ? Math.min(100, Math.max(0, Math.round((usedTokens / maxTokens) * 100))) : 0;
        const isExhausted = remainingTokens < 1;

        if (isExhausted) {
            exhaustedCount++;
        }

        let resetsInMs = 0;
        if (isExhausted && normalizedRate > 0) {
            const tokensNeeded = 1 - remainingTokens;
            resetsInMs = Math.ceil((tokensNeeded / normalizedRate) * 1000);
        }

        let fullRefillInMs = 0;
        if (remainingTokens < maxTokens && normalizedRate > 0) {
            const tokensNeeded = maxTokens - remainingTokens;
            fullRefillInMs = Math.ceil((tokensNeeded / normalizedRate) * 1000);
        }

        const lastRefillAt = lastRefillStr ? new Date(parseInt(lastRefillStr, 10)) : null;
        const lastExhaustedAt = lastExhaustedStr ? new Date(parseInt(lastExhaustedStr, 10)) : null;
        const providerExhaustedCount = exhaustedCountStr ? parseInt(exhaustedCountStr, 10) : 0;

        providersStatus.push({
            provider_id: p.id,
            channel: p.channel,
            plugin_name: p.plugin_name,
            display_name: p.display_name,
            enabled: p.enabled,
            config: {
                max_tokens: maxTokens,
                refill_rate: config.refillRate,
                refill_interval: config.refillInterval || 'second',
                normalized_refill_rate: normalizedRate,
            },
            status: {
                remaining_tokens: remainingTokens,
                used_tokens: usedTokens,
                usage_percentage: usagePercentage,
                is_exhausted: isExhausted,
                resets_in_ms: resetsInMs,
                full_refill_in_ms: fullRefillInMs,
                last_refill_at: lastRefillAt,
                last_exhausted_at: lastExhaustedAt,
                exhausted_count: providerExhaustedCount,
            },
        });
    }

    const response: ProviderRateLimitListResponse = {
        providers: providersStatus,
        summary: {
            total_providers: providersStatus.length,
            exhausted_providers: exhaustedCount,
            healthy_providers: providersStatus.length - exhaustedCount,
        },
    };

    cachedStatusResponse = { data: response, timestamp: now };
    return response;
};

/**
 * Get rate limit status for a single provider
 */
export const getProviderRateLimitStatus = async (providerId: string): Promise<ProviderRateLimitStatus | null> => {
    const all = await getAllProvidersRateLimitStatus();
    return all.providers.find((p) => p.provider_id === providerId) || null;
};

/**
 * Reset rate limiter for a provider (refills bucket to capacity and wipes telemetry)
 */
export const resetRateLimiter = async (providerId: string): Promise<void> => {
    const redis = getRedisClient();
    const { tokensKey, lastRefillKey, queueKey, exhaustedCountKey, lastExhaustedKey } = buildKeys(providerId);

    await redis.del(
        tokensKey,
        lastRefillKey,
        queueKey,
        exhaustedCountKey,
        lastExhaustedKey,
        `ratelimit:tokens:${providerId}`,
        `ratelimit:last_refill:${providerId}`,
        `ratelimit:queue_position:${providerId}`
    );

    clearRateLimitStatusCache();
};
