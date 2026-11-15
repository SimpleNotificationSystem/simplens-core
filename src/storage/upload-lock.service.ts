/**
 * Upload Lock Service
 * Coordinates atomic locking in MongoDB to serialize concurrent uploads with identical hashes
 */

import upload_lock_model from '@src/database/models/upload-lock.models.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

export class UploadLockService {
    /**
     * Attempt to acquire a lock for a given resource key
     */
    static async acquireLock(
        lockKey: string,
        lockedBy: string,
        ttlMs: number = 30000
    ): Promise<boolean> {
        const expiresAt = new Date(Date.now() + ttlMs);
        try {
            await upload_lock_model.create({
                lock_key: lockKey,
                locked_by: lockedBy,
                expires_at: expiresAt,
            });
            return true;
        } catch (err: unknown) {
            const mongoErr = err as { code?: number };
            if (mongoErr.code === 11000) {
                // Lock already exists. Check if it has expired
                const existing = await upload_lock_model.findOne({ lock_key: lockKey });
                if (existing && existing.expires_at < new Date()) {
                    // Stale lock: attempt to take over
                    const updated = await upload_lock_model.findOneAndUpdate(
                        { lock_key: lockKey, expires_at: existing.expires_at },
                        { locked_by: lockedBy, expires_at: expiresAt },
                        { new: true }
                    );
                    return Boolean(updated);
                }
                return false;
            }
            logger.error(`Unexpected error acquiring upload lock for ${lockKey}`, {
                error: err instanceof Error ? err.message : String(err),
            });
            return false;
        }
    }

    /**
     * Release a lock if held by the given holder
     */
    static async releaseLock(lockKey: string, lockedBy: string): Promise<void> {
        try {
            await upload_lock_model.deleteOne({
                lock_key: lockKey,
                locked_by: lockedBy,
            });
        } catch (err) {
            logger.warn(`Failed to release upload lock for ${lockKey}`, {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Wait and acquire a lock, polling every pollIntervalMs until timeoutMs
     */
    static async acquireWithWait(
        lockKey: string,
        lockedBy: string,
        timeoutMs: number = 10000,
        pollIntervalMs: number = 100
    ): Promise<boolean> {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            const acquired = await UploadLockService.acquireLock(lockKey, lockedBy);
            if (acquired) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
        return false;
    }
}
