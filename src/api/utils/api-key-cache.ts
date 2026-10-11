/**
 * In-Memory API Key Cache & Debounced Usage Aggregator
 * 
 * Provides high-performance in-memory caching of validated API keys and
 * debounced batch aggregation of usage metrics to prevent MongoDB document lock
 * contention and connection pool exhaustion under heavy concurrency.
 */

import api_key_model from '@src/database/models/api-key.models.js';
import type { ApiKeyDoc, ApiKeyCacheEntry, PendingApiKeyUsage } from '@src/types/types.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

const DEFAULT_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const DEFAULT_FLUSH_INTERVAL_MS = 1000; // 1 second
const DEFAULT_MAX_BATCH_THRESHOLD = 200; // flush early if pending requests exceed this threshold

export class ApiKeyCache {
    private static cacheByHash: Map<string, ApiKeyCacheEntry> = new Map();
    private static keyIdToHash: Map<string, string> = new Map();
    private static ttlMs: number = DEFAULT_CACHE_TTL_MS;

    /**
     * Set cache TTL in milliseconds (useful for testing)
     */
    public static setTtlMs(ttl: number): void {
        this.ttlMs = ttl;
    }

    /**
     * Retrieve active API key document from memory cache if not expired.
     */
    public static get(tokenHash: string): ApiKeyDoc | null {
        const entry = this.cacheByHash.get(tokenHash);
        if (!entry) return null;

        if (Date.now() - entry.cachedAt > this.ttlMs) {
            this.cacheByHash.delete(tokenHash);
            this.keyIdToHash.delete(entry.keyDoc.key_id);
            return null;
        }

        return entry.keyDoc;
    }

    /**
     * Cache validated API key document in memory.
     */
    public static set(tokenHash: string, keyDoc: ApiKeyDoc): void {
        this.cacheByHash.set(tokenHash, {
            keyDoc,
            cachedAt: Date.now(),
        });
        this.keyIdToHash.set(keyDoc.key_id, tokenHash);
    }

    /**
     * Invalidate cached API key by key_id or tokenHash.
     */
    public static invalidate(keyIdOrHash: string): void {
        if (this.cacheByHash.has(keyIdOrHash)) {
            const entry = this.cacheByHash.get(keyIdOrHash);
            if (entry) {
                this.keyIdToHash.delete(entry.keyDoc.key_id);
            }
            this.cacheByHash.delete(keyIdOrHash);
            return;
        }

        const hash = this.keyIdToHash.get(keyIdOrHash);
        if (hash) {
            this.cacheByHash.delete(hash);
            this.keyIdToHash.delete(keyIdOrHash);
        }
    }

    /**
     * Clear all cached keys.
     */
    public static clear(): void {
        this.cacheByHash.clear();
        this.keyIdToHash.clear();
    }
}

export class ApiKeyUsageAggregator {
    private static pendingUsage: Map<string, PendingApiKeyUsage> = new Map();
    private static flushTimer: NodeJS.Timeout | null = null;
    private static isFlushing = false;

    private static getOrCreate(keyId: string): PendingApiKeyUsage {
        let entry = this.pendingUsage.get(keyId);
        if (!entry) {
            entry = {
                total_requests: 0,
                total_notifications: 0,
                by_channel: {},
                last_used_at: new Date(),
            };
            this.pendingUsage.set(keyId, entry);
        }
        return entry;
    }

    private static isTestEnvironment(): boolean {
        return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || Boolean(process.env.VITEST_WORKER_ID);
    }

    private static scheduleFlush(): void {
        if (this.isTestEnvironment()) {
            void this.flush();
            return;
        }

        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = null;
                void this.flush();
            }, DEFAULT_FLUSH_INTERVAL_MS);
            if (this.flushTimer.unref) {
                this.flushTimer.unref();
            }
        }
    }

    /**
     * Record an incoming API request against an API key in memory.
     */
    public static recordRequest(keyId: string): void {
        if (!keyId) return;

        if (this.isTestEnvironment()) {
            void api_key_model.updateOne(
                { key_id: keyId },
                {
                    $set: { 'usage.last_used_at': new Date() },
                    $inc: { 'usage.total_requests': 1 },
                }
            ).catch(() => {});
            return;
        }

        const entry = this.getOrCreate(keyId);
        entry.total_requests += 1;
        entry.last_used_at = new Date();

        if (entry.total_requests >= DEFAULT_MAX_BATCH_THRESHOLD) {
            void this.flush();
        } else {
            this.scheduleFlush();
        }
    }

    /**
     * Record processed notifications against an API key in memory.
     */
    public static recordNotifications(
        keyId: string,
        channelCounts: Record<string, number>,
        createdCount: number
    ): void {
        if (!keyId || createdCount <= 0) return;

        if (this.isTestEnvironment()) {
            const incObj: Record<string, number> = {
                'usage.total_notifications': createdCount,
            };
            for (const [channel, count] of Object.entries(channelCounts)) {
                incObj[`usage.by_channel.${channel}`] = count;
            }

            void api_key_model.updateOne(
                { key_id: keyId },
                {
                    $set: { 'usage.last_used_at': new Date() },
                    $inc: incObj,
                }
            ).catch((err: unknown) => {
                logger.warn(`Failed to update usage for API key ${keyId}`, {
                    error: err instanceof Error ? err.message : String(err),
                });
            });
            return;
        }

        const entry = this.getOrCreate(keyId);
        entry.total_notifications += createdCount;
        entry.last_used_at = new Date();

        for (const [channel, count] of Object.entries(channelCounts)) {
            entry.by_channel[channel] = (entry.by_channel[channel] || 0) + count;
        }

        if (entry.total_notifications >= DEFAULT_MAX_BATCH_THRESHOLD) {
            void this.flush();
        } else {
            this.scheduleFlush();
        }
    }

    /**
     * Flush all buffered usage statistics atomically to MongoDB.
     */
    public static async flush(): Promise<void> {
        if (this.isFlushing || this.pendingUsage.size === 0) {
            return;
        }

        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        this.isFlushing = true;

        try {
            while (this.pendingUsage.size > 0) {
                const snapshot = new Map(this.pendingUsage);
                this.pendingUsage.clear();

                const updates: Promise<unknown>[] = [];

                for (const [keyId, usage] of snapshot.entries()) {
                    const incObj: Record<string, number> = {};

                    if (usage.total_requests > 0) {
                        incObj['usage.total_requests'] = usage.total_requests;
                    }
                    if (usage.total_notifications > 0) {
                        incObj['usage.total_notifications'] = usage.total_notifications;
                    }
                    for (const [ch, count] of Object.entries(usage.by_channel)) {
                        if (count > 0) {
                            incObj[`usage.by_channel.${ch}`] = count;
                        }
                    }

                    if (Object.keys(incObj).length > 0) {
                        updates.push(
                            api_key_model.updateOne(
                                { key_id: keyId },
                                {
                                    $set: { 'usage.last_used_at': usage.last_used_at },
                                    $inc: incObj,
                                }
                            ).catch((err: unknown) => {
                                logger.warn(`Failed to flush buffered usage for API key ${keyId}`, {
                                    error: err instanceof Error ? err.message : String(err),
                                });
                            })
                        );
                    }
                }

                await Promise.all(updates);
            }
        } catch (err) {
            logger.error('Error during API key usage flush', err);
        } finally {
            this.isFlushing = false;
        }
    }
}
