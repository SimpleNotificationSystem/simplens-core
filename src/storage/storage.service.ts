/**
 * Central Storage Service
 * Orchestrates file hash computation, duplicate tracking, and delegation to active storage provider
 */

import crypto from 'crypto';
import { Transform, Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import type {
    FileAttachmentDoc,
    StorageDownloadResult,
    StorageProvider,
    StorageProviderDoc,
    FileAttachmentConfig,
    UploadFileInput,
} from '@src/types/types.js';
import file_attachment_model from '@src/database/models/file-attachment.models.js';
import storage_provider_model from '@src/database/models/storage-provider.models.js';
import { getOrCreateEncryptionKey } from '@src/admin-alerts/key-manager.js';
import { decrypt } from '@src/utils/encryption.utils.js';
import { getStorageProvider, hasStorageProvider } from './storage-registry.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';
import { PluginRegistry, ProviderManagerService } from '@src/plugins/index.js';
import { env } from '@src/config/env.config.js';
import { UploadLockService } from './upload-lock.service.js';
// Register built-in storage providers
import './providers/minio.storage.js';

/**
 * Transform stream that computes SHA-256 hash and meters byte count on the fly
 */
export class HashingAndMeteringStream extends Transform {
    private hash = crypto.createHash('sha256');
    public bytesCount = 0;
    public calculatedHash = '';
    private maxBytes: number;

    constructor(maxBytes: number) {
        super();
        this.maxBytes = maxBytes;
    }

    _transform(
        chunk: Buffer,
        encoding: BufferEncoding,
        callback: (error?: Error | null, data?: Buffer) => void
    ): void {
        this.bytesCount += chunk.length;
        if (this.bytesCount > this.maxBytes) {
            const maxMb = Math.floor(this.maxBytes / (1024 * 1024));
            return callback(
                new Error(`File size exceeds maximum allowed limit of ${maxMb}MB (${this.maxBytes} bytes)`)
            );
        }
        this.hash.update(chunk);
        callback(null, chunk);
    }

    _flush(callback: (error?: Error | null) => void): void {
        this.calculatedHash = this.hash.digest('hex');
        callback();
    }
}

export class StorageService {
    /**
     * Compute SHA-256 hash of a file buffer
     */
    static computeHash(buffer: Buffer): string {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Resolve effective file attachment limits combining SimpleNS global limits and provider limits.
     * Primary lookup: MongoDB (Provider collection).
     * Secondary fallback: provider.getFileAttachmentConfig() / PluginRegistry.
     */
    static async resolveEffectiveLimits(channel?: string, providerId?: string): Promise<{
        enabled: boolean;
        maxFileSize: number;
        maxCount: number;
        allowedMimeTypes?: string[];
    }> {
        const globalMaxSize = env.SIMPLENS_MAX_FILE_SIZE;
        const globalMaxCount = env.SIMPLENS_MAX_FILE_COUNT;

        let providerLimits: FileAttachmentConfig | undefined;
        try {
            providerLimits = await ProviderManagerService.getEffectiveFileAttachmentConfig(providerId, channel);
        } catch {
            // Fallback to in-memory PluginRegistry if database is uninitialized or in test mode
            try {
                if (providerId && PluginRegistry.has(providerId)) {
                    providerLimits = PluginRegistry.get(providerId)?.getFileAttachmentConfig?.();
                } else if (channel && PluginRegistry.hasChannel(channel)) {
                    providerLimits = PluginRegistry.getDefaultProvider(channel)?.getFileAttachmentConfig?.();
                }
            } catch {
                // Ignore
            }
        }

        const effectiveMaxSize = Math.min(
            globalMaxSize,
            providerLimits?.maxFileSize && providerLimits.maxFileSize > 0
                ? providerLimits.maxFileSize
                : globalMaxSize
        );
        const effectiveMaxCount = Math.min(
            globalMaxCount,
            providerLimits?.maxCount && providerLimits.maxCount > 0
                ? providerLimits.maxCount
                : globalMaxCount
        );

        const isEnabled = providerLimits ? providerLimits.enabled !== false : true;

        return {
            enabled: isEnabled,
            maxFileSize: effectiveMaxSize,
            maxCount: effectiveMaxCount,
            allowedMimeTypes: providerLimits?.allowedMimeTypes,
        };
    }

    /**
     * Get active storage provider instance and its document if configured
     */
    static async getActiveProvider(): Promise<{
        provider: StorageProvider;
        doc: StorageProviderDoc;
    } | null> {
        try {
            const doc = await storage_provider_model.findOne({
                is_active: true,
                enabled: true,
            });

            if (!doc) {
                return null;
            }

            if (!hasStorageProvider(doc.provider_type)) {
                logger.warn(`Active storage provider type '${doc.provider_type}' is not registered`);
                return null;
            }

            const encryptionKey = await getOrCreateEncryptionKey();
            const decryptedConfig = decrypt(doc.config, encryptionKey);
            const parsedConfig = JSON.parse(decryptedConfig);

            const provider = getStorageProvider(doc.provider_type, parsedConfig);
            return { provider, doc };
        } catch (err) {
            logger.error('Failed to load active storage provider:', err);
            return null;
        }
    }

    /**
     * Get a storage provider instance by MongoDB _id (checks active provider first, then enabled inactive providers)
     */
    static async getProviderById(providerId: string): Promise<{
        provider: StorageProvider;
        doc: StorageProviderDoc;
    } | null> {
        try {
            const active = await StorageService.getActiveProvider();
            if (active && String(active.doc._id) === String(providerId)) {
                return active;
            }

            const doc = await storage_provider_model.findById(providerId);
            if (!doc || !doc.enabled) {
                logger.warn(`Storage provider with ID '${providerId}' not found or is disabled`);
                return null;
            }

            if (!hasStorageProvider(doc.provider_type)) {
                logger.warn(`Storage provider type '${doc.provider_type}' is not registered`);
                return null;
            }

            const encryptionKey = await getOrCreateEncryptionKey();
            const decryptedConfig = decrypt(doc.config, encryptionKey);
            const parsedConfig = JSON.parse(decryptedConfig);

            const provider = getStorageProvider(doc.provider_type, parsedConfig);
            return { provider, doc };
        } catch (err) {
            logger.error(`Failed to load storage provider by ID '${providerId}':`, err);
            return null;
        }
    }

    /**
     * Get a storage provider instance by type (checks active provider first, then configured enabled inactive providers)
     */
    static async getProviderByType(providerType: string): Promise<{
        provider: StorageProvider;
        doc: StorageProviderDoc;
    } | null> {
        try {
            const active = await StorageService.getActiveProvider();
            if (active && active.doc.provider_type === providerType) {
                return active;
            }

            const doc = await storage_provider_model.findOne({
                provider_type: providerType,
                enabled: true,
            });

            if (!doc) {
                return null;
            }

            if (!hasStorageProvider(doc.provider_type)) {
                logger.warn(`Storage provider type '${doc.provider_type}' is not registered`);
                return null;
            }

            const encryptionKey = await getOrCreateEncryptionKey();
            const decryptedConfig = decrypt(doc.config, encryptionKey);
            const parsedConfig = JSON.parse(decryptedConfig);

            const provider = getStorageProvider(doc.provider_type, parsedConfig);
            return { provider, doc };
        } catch (err) {
            logger.error(`Failed to load storage provider for type '${providerType}':`, err);
            return null;
        }
    }

    /**
     * Resolve a storage provider instance for a file attachment (using storage_provider_id first, falling back to storage_provider type)
     */
    static async getProviderForAttachment(attachment: {
        storage_provider_id?: string;
        storage_provider?: string;
    }): Promise<{
        provider: StorageProvider;
        doc: StorageProviderDoc;
    } | null> {
        if (attachment.storage_provider_id) {
            const byId = await StorageService.getProviderById(attachment.storage_provider_id);
            if (byId) return byId;
        }

        if (attachment.storage_provider) {
            const byType = await StorageService.getProviderByType(attachment.storage_provider);
            if (byType) return byType;
        }

        return null;
    }

    /**
     * Check if an active storage provider is available and ready
     */
    static async hasActiveProvider(): Promise<boolean> {
        const active = await StorageService.getActiveProvider();
        return active !== null;
    }

    /**
     * Save an uploaded file stream, compute its hash on the fly, store directly with active provider,
     * and save metadata. Uses MongoDB lock to prevent race conditions during concurrent duplicate uploads.
     */
    static async saveFile(
        file: UploadFileInput,
        metadata?: Record<string, unknown>
    ): Promise<FileAttachmentDoc> {
        const active = await StorageService.getActiveProvider();
        if (!active) {
            throw new Error('No active storage provider configured. Enable at most one active storage provider to attach files.');
        }

        // Precompute hash if buffer is provided directly
        if (!file.hash && file.buffer) {
            file.hash = StorageService.computeHash(file.buffer);
        }

        // Fast-path deduplication check if hash is already known for this active provider instance
        if (file.hash && active.doc._id) {
            const query = file_attachment_model.findOne({
                hash: file.hash,
                filename: file.originalname,
                storage_provider_id: String(active.doc._id),
            });
            const existing = typeof (query as unknown as { lean?: () => Promise<FileAttachmentDoc | null> })?.lean === 'function'
                ? await (query as unknown as { lean: () => Promise<FileAttachmentDoc | null> }).lean()
                : await (query as unknown as Promise<FileAttachmentDoc | null>);

            if (existing) {
                logger.info(`Deduplicated file upload by SHA-256 hash (${file.hash}) in active provider ${active.doc._id}, returning existing attachment: ${existing.file_id}`);
                return existing;
            }
        }

        const maxFileSize = env.SIMPLENS_MAX_FILE_SIZE;
        const meteringStream = new HashingAndMeteringStream(maxFileSize);

        let sourceStream: NodeJS.ReadableStream;
        if (file.stream) {
            sourceStream = file.stream;
        } else if (file.buffer) {
            sourceStream = Readable.from(file.buffer);
        } else {
            throw new Error('No stream or buffer provided in file upload');
        }

        let streamError: Error | null = null;
        meteringStream.on('error', (err: Error) => {
            streamError = err;
            const destroyable = sourceStream as unknown as { destroy?: (err?: Error) => void };
            if (typeof destroyable.destroy === 'function') {
                destroyable.destroy(err);
            }
        });
        (sourceStream as Readable).on('error', (err: Error) => {
            if (!streamError) {
                streamError = err;
            }
        });

        // Pipe source stream through metering & hashing stream
        const uploadStream = (sourceStream as Readable).pipe(meteringStream);

        const fileId = uuidv4();

        // Direct upload streaming to active storage provider
        const uploadResult = await active.provider.upload({
            fileId,
            filename: file.originalname,
            mimeType: file.mimetype,
            stream: uploadStream,
            buffer: file.buffer,
            size: file.size,
            hash: file.hash,
            metadata,
        });

        if (!uploadResult.success) {
            const errorMsg = (streamError as Error | null)?.message || uploadResult.error || 'Failed to upload file to storage provider';
            throw new Error(errorMsg);
        }

        // Ensure the metering stream finishes if provider returned early or did not consume fully
        if (!meteringStream.writableEnded) {
            await new Promise<void>((resolve) => {
                uploadStream.on('finish', resolve);
                uploadStream.on('error', () => resolve());
                uploadStream.resume();
            });
        }

        // Finalize computed hash and size
        const computedHash = file.hash || meteringStream.calculatedHash;
        const computedSize = meteringStream.bytesCount || file.size || uploadResult.size || 0;

        // Acquire distributed upload lock to serialize concurrent uploads with identical hash for the active provider
        const lockKey = `upload_lock:${active.doc._id}:${computedHash}:${file.originalname}`;
        const lockAcquired = await UploadLockService.acquireWithWait(lockKey, fileId, 10000, 100);

        try {
            // Check if another client concurrently completed saving this exact file to this active provider
            const duplicateQuery = file_attachment_model.findOne({
                hash: computedHash,
                filename: file.originalname,
                storage_provider_id: String(active.doc._id),
            });
            const existingAfterUpload = typeof (duplicateQuery as unknown as { lean?: () => Promise<FileAttachmentDoc | null> })?.lean === 'function'
                ? await (duplicateQuery as unknown as { lean: () => Promise<FileAttachmentDoc | null> }).lean()
                : await (duplicateQuery as unknown as Promise<FileAttachmentDoc | null>);

            if (existingAfterUpload) {
                logger.info(`Deduplicated concurrent file upload by SHA-256 hash (${computedHash}) in active provider ${active.doc._id}, returning existing attachment: ${existingAfterUpload.file_id}`);

                // Best-effort cleanup of newly uploaded duplicate blob from storage provider
                try {
                    const deleteResult = await active.provider.delete(fileId, uploadResult.storageKey);
                    if (deleteResult.success) {
                        logger.debug(`Cleaned up redundant uploaded duplicate file '${fileId}' (${uploadResult.storageKey || fileId}) from storage`);
                    } else {
                        logger.warn(`Storage provider could not clean up redundant duplicate file '${fileId}': ${deleteResult.error}`);
                    }
                } catch (cleanupErr) {
                    logger.warn(`Failed to clean up redundant uploaded duplicate file '${fileId}' from storage:`, {
                        error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
                    });
                }

                return existingAfterUpload;
            }

            const doc = await file_attachment_model.create({
                file_id: fileId,
                filename: file.originalname,
                mime_type: file.mimetype,
                size: computedSize,
                hash: computedHash,
                storage_provider: active.doc.provider_type,
                storage_provider_id: active.doc._id ? String(active.doc._id) : undefined,
                storage_key: uploadResult.storageKey,
                url: uploadResult.url,
                metadata,
            });

            return typeof doc.toObject === 'function' ? doc.toObject() : (doc as unknown as FileAttachmentDoc);
        } finally {
            if (lockAcquired) {
                await UploadLockService.releaseLock(lockKey, fileId);
            }
        }
    }

    /**
     * Retrieve file metadata by file_id
     */
    static async getFileMetadata(fileId: string): Promise<FileAttachmentDoc | null> {
        return file_attachment_model.findOne({ file_id: fileId }).lean();
    }

    /**
     * Download file data by file_id across active or inactive configured storage providers
     */
    static async downloadFile(fileId: string): Promise<{
        attachment: FileAttachmentDoc;
        download: StorageDownloadResult;
        provider: StorageProvider;
    }> {
        const attachment = await file_attachment_model.findOne({ file_id: fileId }).lean<FileAttachmentDoc | null>();
        if (!attachment) {
            throw new Error(`File not found: ${fileId}`);
        }

        const providerInstance = await StorageService.getProviderForAttachment(attachment);
        if (!providerInstance) {
            throw new Error(`No storage provider available to retrieve file '${fileId}' (provider may be disabled or not configured)`);
        }

        const download = await providerInstance.provider.download(fileId, attachment.storage_key);
        if (!download.success) {
            throw new Error(download.error || 'Failed to download file from storage provider');
        }

        return { attachment, download, provider: providerInstance.provider };
    }

    /**
     * Delete file from storage and database.
     * Enforces two-phase safe deletion: deletes from storage first, and only removes the MongoDB
     * record if storage provider deletion succeeded, allowing recovery cron to self-heal and retry on failures.
     */
    static async deleteFile(fileId: string): Promise<boolean> {
        const attachment = await file_attachment_model.findOne({ file_id: fileId }).lean<FileAttachmentDoc | null>();
        if (!attachment) {
            return false;
        }

        const providerType = attachment.storage_provider;

        if (attachment.storage_provider_id || (providerType && hasStorageProvider(providerType))) {
            const providerInstance = await StorageService.getProviderForAttachment(attachment);
            if (!providerInstance) {
                const targetRef = attachment.storage_provider_id || providerType;
                logger.warn(`Storage provider '${targetRef}' for file '${fileId}' is not configured or is disabled. Deferring deletion.`);
                throw new Error(`Storage provider '${targetRef}' not configured or is disabled. Cannot delete physical file.`);
            }

            const deleteResult = await providerInstance.provider.delete(fileId, attachment.storage_key);
            if (!deleteResult.success) {
                logger.error(`Storage provider '${providerInstance.doc.name}' (${providerInstance.doc.provider_type}) failed to delete file '${fileId}': ${deleteResult.error}`);
                throw new Error(`Failed to delete file '${fileId}' from storage provider '${providerInstance.doc.name}': ${deleteResult.error || 'Unknown storage error'}`);
            }
        } else if (providerType) {
            logger.warn(`Storage provider type '${providerType}' for file '${fileId}' is not found in registry. Deleting DB record.`);
        }

        await file_attachment_model.deleteOne({ file_id: fileId });
        return true;
    }
}
