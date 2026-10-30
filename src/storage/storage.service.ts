/**
 * Central Storage Service
 * Orchestrates file hash computation, duplicate tracking, and delegation to active storage provider
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
    FileAttachmentDoc,
    StorageDownloadResult,
    StorageProvider,
    StorageProviderDoc,
} from '@src/types/types.js';
import file_attachment_model from '@src/database/models/file-attachment.models.js';
import storage_provider_model from '@src/database/models/storage-provider.models.js';
import { getOrCreateEncryptionKey } from '@src/admin-alerts/key-manager.js';
import { decrypt } from '@src/utils/encryption.utils.js';
import { getStorageProvider, hasStorageProvider } from './storage-registry.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';
// Register built-in storage providers
import './providers/minio.storage.js';

export interface UploadFileInput {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}

export class StorageService {
    /**
     * Compute SHA-256 hash of a file buffer
     */
    static computeHash(buffer: Buffer): string {
        return crypto.createHash('sha256').update(buffer).digest('hex');
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
     * Save an uploaded file, compute its hash, store with active provider, and save metadata.
     * Deduplicates uploads if an identical file (by SHA-256 and filename) already exists.
     */
    static async saveFile(
        file: UploadFileInput,
        metadata?: Record<string, unknown>
    ): Promise<FileAttachmentDoc> {
        const hash = StorageService.computeHash(file.buffer);
        const active = await StorageService.getActiveProvider();

        // Check if an identical file has already been saved for this storage provider
        const query = file_attachment_model.findOne({
            hash,
            filename: file.originalname,
            storage_provider: active?.doc.provider_type,
        });
        const existing = typeof (query as unknown as { lean?: () => Promise<FileAttachmentDoc | null> })?.lean === 'function'
            ? await (query as unknown as { lean: () => Promise<FileAttachmentDoc | null> }).lean()
            : await (query as unknown as Promise<FileAttachmentDoc | null>);

        if (existing) {
            logger.info(`Deduplicated file upload by SHA-256 hash (${hash}), returning existing attachment: ${existing.file_id}`);
            return existing;
        }

        const fileId = uuidv4();

        let storageKey: string | undefined;
        let url: string | undefined;

        if (active) {
            const uploadResult = await active.provider.upload({
                fileId,
                filename: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                buffer: file.buffer,
                hash,
                metadata,
            });

            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'Failed to upload file to storage provider');
            }

            storageKey = uploadResult.storageKey;
            url = uploadResult.url;
        }

        const doc = await file_attachment_model.create({
            file_id: fileId,
            filename: file.originalname,
            mime_type: file.mimetype,
            size: file.size,
            hash,
            storage_provider: active?.doc.provider_type,
            storage_key: storageKey,
            url,
            metadata,
        });

        return doc.toObject();
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
