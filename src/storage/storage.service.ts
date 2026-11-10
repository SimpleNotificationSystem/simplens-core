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

        return {
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

        // Fast-path deduplication check if hash is already known
        if (file.hash) {
            const query = file_attachment_model.findOne({
                hash: file.hash,
                filename: file.originalname,
                storage_provider: active.doc.provider_type,
            });
            const existing = typeof (query as unknown as { lean?: () => Promise<FileAttachmentDoc | null> })?.lean === 'function'
                ? await (query as unknown as { lean: () => Promise<FileAttachmentDoc | null> }).lean()
                : await (query as unknown as Promise<FileAttachmentDoc | null>);

            if (existing) {
                logger.info(`Deduplicated file upload by SHA-256 hash (${file.hash}), returning existing attachment: ${existing.file_id}`);
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

        // Acquire distributed upload lock to serialize concurrent uploads with identical hash
        const lockKey = `upload_lock:${active.doc.provider_type}:${computedHash}:${file.originalname}`;
        const lockAcquired = await UploadLockService.acquireWithWait(lockKey, fileId, 10000, 100);

        try {
            // Check if another client concurrently completed saving this exact file
            const duplicateQuery = file_attachment_model.findOne({
                hash: computedHash,
                filename: file.originalname,
                storage_provider: active.doc.provider_type,
            });
            const existingAfterUpload = typeof (duplicateQuery as unknown as { lean?: () => Promise<FileAttachmentDoc | null> })?.lean === 'function'
                ? await (duplicateQuery as unknown as { lean: () => Promise<FileAttachmentDoc | null> }).lean()
                : await (duplicateQuery as unknown as Promise<FileAttachmentDoc | null>);

            if (existingAfterUpload) {
                logger.info(`Deduplicated concurrent file upload by SHA-256 hash (${computedHash}), returning existing attachment: ${existingAfterUpload.file_id}`);
                return existingAfterUpload;
            }

            const doc = await file_attachment_model.create({
                file_id: fileId,
                filename: file.originalname,
                mime_type: file.mimetype,
                size: computedSize,
                hash: computedHash,
                storage_provider: active.doc.provider_type,
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
     * Download file data by file_id
     */
    static async downloadFile(fileId: string): Promise<{
        attachment: FileAttachmentDoc;
        download: StorageDownloadResult;
    }> {
        const attachment = await file_attachment_model.findOne({ file_id: fileId }).lean<FileAttachmentDoc | null>();
        if (!attachment) {
            throw new Error(`File not found: ${fileId}`);
        }

        const active = await StorageService.getActiveProvider();
        if (!active) {
            throw new Error('No active storage provider configured to retrieve file');
        }

        const download = await active.provider.download(fileId, attachment.storage_key);
        if (!download.success) {
            throw new Error(download.error || 'Failed to download file from storage provider');
        }

        return { attachment, download };
    }

    /**
     * Delete file from storage and database
     */
    static async deleteFile(fileId: string): Promise<boolean> {
        const attachment = await file_attachment_model.findOne({ file_id: fileId }).lean<FileAttachmentDoc | null>();
        if (!attachment) {
            return false;
        }

        const active = await StorageService.getActiveProvider();
        if (active) {
            await active.provider.delete(fileId, attachment.storage_key);
        }

        await file_attachment_model.deleteOne({ file_id: fileId });
        return true;
    }
}
