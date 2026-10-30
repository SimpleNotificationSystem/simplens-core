import type { Request, Response } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import storage_provider_model from '@src/database/models/storage-provider.models.js';
import { StorageService } from '@src/storage/storage.service.js';
import {
    getStorageProvider,
    hasStorageProvider,
    getStorageProviderMetadata,
} from '@src/storage/storage-registry.js';
import { getOrCreateEncryptionKey } from '@src/admin-alerts/key-manager.js';
import { encrypt } from '@src/utils/encryption.utils.js';
import {
    storageProviderCreateSchema,
    storageProviderUpdateSchema,
} from '@src/types/schemas.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

// Multer memory storage configuration (default 10MB per file)
const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB hard limit
        files: 10,
    },
});

export const fileUploadMiddleware = uploadMiddleware.any();

/**
 * POST /api/file/upload
 * Accepts multipart/form-data with one or multiple files
 */
export const uploadFiles = async (req: Request, res: Response): Promise<void> => {
    try {
        const files = req.files as Express.Multer.File[] | undefined;
        if (!files || files.length === 0) {
            res.status(400).json({
                success: false,
                error: 'No files provided in upload request',
            });
            return;
        }

        const hasActive = await StorageService.hasActiveProvider();
        if (!hasActive) {
            res.status(400).json({
                success: false,
                error: 'No active storage provider configured. Enable at most one active storage provider to attach files.',
            });
            return;
        }

        const uploadedAttachments = [];
        for (const file of files) {
            const saved = await StorageService.saveFile({
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                buffer: file.buffer,
            });

            uploadedAttachments.push({
                id: saved.file_id,
                filename: saved.filename,
                mime_type: saved.mime_type,
                size: saved.size,
                hash: saved.hash,
                url: saved.url,
                created_at: saved.created_at,
            });
        }

        res.status(200).json({
            success: true,
            files: uploadedAttachments,
        });
    } catch (err) {
        logger.error('Failed to process file upload:', err);
        res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : 'Internal server error during file upload',
        });
    }
};

/**
 * GET /api/file/:id
 * Retrieve file metadata
 */
export const getFileMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const metadata = await StorageService.getFileMetadata(id);
        if (!metadata) {
            res.status(404).json({
                success: false,
                error: 'File not found',
            });
            return;
        }

        res.json({
            success: true,
            file: {
                id: metadata.file_id,
                filename: metadata.filename,
                mime_type: metadata.mime_type,
                size: metadata.size,
                hash: metadata.hash,
                url: metadata.url,
                created_at: metadata.created_at,
            },
        });
    } catch (err) {
        logger.error(`Error retrieving file metadata for ${req.params.id}:`, err);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve file metadata',
        });
    }
};

/**
 * GET /api/file/:id/download
 * Download file content
 */
export const downloadFile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { attachment, download } = await StorageService.downloadFile(id);

        res.setHeader('Content-Type', download.contentType || attachment.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${download.filename || attachment.filename}"`);

        if (download.buffer) {
            res.send(download.buffer);
            return;
        }

        if (download.stream) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (download.stream as any).pipe(res);
            return;
        }

        res.status(500).json({
            success: false,
            error: 'No file content stream or buffer returned from storage provider',
        });
    } catch (err) {
        logger.error(`Error downloading file ${req.params.id}:`, err);
        res.status(404).json({
            success: false,
            error: err instanceof Error ? err.message : 'File not found or failed to download',
        });
    }
};

// ============================================================================
// STORAGE PROVIDER CONFIGURATION & MANAGEMENT
// ============================================================================

/**
 * GET /api/storage/status
 * Get whether an active storage provider exists and its summary
 */
export const getActiveStorageProviderStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
        const active = await StorageService.getActiveProvider();
        if (!active) {
            res.json({
                hasActiveProvider: false,
            });
            return;
        }

        res.json({
            hasActiveProvider: true,
            activeProvider: {
                id: active.doc._id?.toString(),
                name: active.doc.name,
                provider_type: active.doc.provider_type,
            },
        });
    } catch (err) {
        logger.error('Error fetching active storage provider status:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to get storage status',
        });
    }
};

/**
 * GET /api/storage/providers
 * List available storage provider types and their credential schemas
 */
export const getAvailableStorageProviders = (_req: Request, res: Response): void => {
    try {
        const providers = getStorageProviderMetadata();
        res.json({ providers });
    } catch (err) {
        logger.error('Error getting storage providers metadata:', err);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve storage providers',
        });
    }
};

/**
 * POST /api/storage/test
 * Test a storage provider connection
 */
export const testStorageConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const { provider_type, config } = req.body;

        if (!provider_type || !config) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: provider_type, config',
            });
            return;
        }

        if (!hasStorageProvider(provider_type)) {
            res.status(400).json({
                success: false,
                error: `Unsupported storage provider type: ${provider_type}`,
            });
            return;
        }

        const provider = getStorageProvider(provider_type, config);
        const result = await provider.testConnection();

        if (result.success) {
            res.json({ success: true, message: 'Storage connection test successful!' });
        } else {
            res.status(400).json({
                success: false,
                error: result.error || 'Storage connection test failed',
            });
        }
    } catch (err) {
        logger.error('Error testing storage connection:', err);
        res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : 'Internal error testing storage connection',
        });
    }
};

/**
 * GET /api/storage
 * List all configured storage providers
 */
export const listStorageProviders = async (_req: Request, res: Response): Promise<void> => {
    try {
        const providers = await storage_provider_model.find({})
            .select('-config')
            .sort({ created_at: -1 })
            .lean();

        res.json({ providers });
    } catch (err) {
        logger.error('Error fetching storage providers:', err);
        res.status(500).json({ error: 'Failed to fetch storage providers' });
    }
};

/**
 * POST /api/storage
 * Create a new storage provider
 */
export const createStorageProvider = async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = storageProviderCreateSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: 'Validation failed',
                details: parsed.error.issues,
            });
            return;
        }

        const { name, provider_type, config, enabled, is_active } = parsed.data;

        if (!hasStorageProvider(provider_type)) {
            res.status(400).json({ error: `Unsupported storage provider type: ${provider_type}` });
            return;
        }

        // Validate credential fields against provider schema
        const providerInstance = getStorageProvider(provider_type, config);
        const schema = providerInstance.getCredentialSchema();
        const errors: string[] = [];

        for (const field of schema) {
            const value = config[field.name];
            if (field.required && (!value || value.trim() === '')) {
                errors.push(`${field.label} is required`);
            }
        }

        if (errors.length > 0) {
            res.status(400).json({ error: 'Validation failed', details: errors });
            return;
        }

        // Encrypt credentials
        const encryptionKey = await getOrCreateEncryptionKey();
        const encryptedConfig = encrypt(JSON.stringify(config), encryptionKey);

        // Enforce single active provider: if this one is active, demote all others
        if (is_active) {
            await storage_provider_model.updateMany({}, { is_active: false });
        }

        const newProvider = await storage_provider_model.create({
            name,
            provider_type,
            enabled,
            is_active,
            config: encryptedConfig,
        });

        res.status(201).json({
            success: true,
            provider: {
                _id: newProvider._id,
                name: newProvider.name,
                provider_type: newProvider.provider_type,
                enabled: newProvider.enabled,
                is_active: newProvider.is_active,
                created_at: newProvider.created_at,
            },
        });
    } catch (err) {
        logger.error('Error creating storage provider:', err);
        res.status(500).json({ error: 'Failed to create storage provider' });
    }
};

/**
 * PATCH /api/storage/:id
 * Update a storage provider
 */
export const updateStorageProvider = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ error: 'Invalid provider ID format' });
            return;
        }

        const parsed = storageProviderUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: 'Validation failed',
                details: parsed.error.issues,
            });
            return;
        }

        const existing = await storage_provider_model.findById(id);
        if (!existing) {
            res.status(404).json({ error: 'Storage provider not found' });
            return;
        }

        const updates = parsed.data;

        // If setting as active, demote all other providers and ensure enabled
        if (updates.is_active === true) {
            await storage_provider_model.updateMany({ _id: { $ne: id } }, { is_active: false });
            existing.enabled = true;
        }

        if (updates.name) existing.name = updates.name;
        if (updates.enabled !== undefined) {
            existing.enabled = updates.enabled;
            if (!updates.enabled) {
                existing.is_active = false;
            }
        }
        if (updates.is_active !== undefined) {
            existing.is_active = updates.is_active;
        }

        if (updates.config) {
            const providerInstance = getStorageProvider(existing.provider_type, updates.config);
            const schema = providerInstance.getCredentialSchema();
            const errors: string[] = [];

            for (const field of schema) {
                const value = updates.config[field.name];
                if (field.required && (!value || value.trim() === '')) {
                    errors.push(`${field.label} is required`);
                }
            }

            if (errors.length > 0) {
                res.status(400).json({ error: 'Validation failed', details: errors });
                return;
            }

            const encryptionKey = await getOrCreateEncryptionKey();
            existing.config = encrypt(JSON.stringify(updates.config), encryptionKey);
        }

        await existing.save();

        res.json({
            success: true,
            provider: {
                _id: existing._id,
                name: existing.name,
                provider_type: existing.provider_type,
                enabled: existing.enabled,
                is_active: existing.is_active,
                updated_at: existing.updated_at,
            },
        });
    } catch (err) {
        logger.error(`Error updating storage provider ${req.params.id}:`, err);
        res.status(500).json({ error: 'Failed to update storage provider' });
    }
};

/**
 * PATCH /api/storage/:id/activate
 * Promotes the chosen provider as the single active provider
 */
export const activateStorageProvider = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ error: 'Invalid provider ID format' });
            return;
        }

        const target = await storage_provider_model.findById(id);
        if (!target) {
            res.status(404).json({ error: 'Storage provider not found' });
            return;
        }

        // Demote all other providers
        await storage_provider_model.updateMany({ _id: { $ne: id } }, { is_active: false });

        target.is_active = true;
        target.enabled = true;
        await target.save();

        res.json({
            success: true,
            provider: {
                _id: target._id,
                name: target.name,
                provider_type: target.provider_type,
                enabled: target.enabled,
                is_active: target.is_active,
            },
        });
    } catch (err) {
        logger.error(`Error activating storage provider ${req.params.id}:`, err);
        res.status(500).json({ error: 'Failed to activate storage provider' });
    }
};

/**
 * DELETE /api/storage/:id
 * Delete a storage provider
 */
export const deleteStorageProvider = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ error: 'Invalid provider ID format' });
            return;
        }

        const deleted = await storage_provider_model.findByIdAndDelete(id);
        if (!deleted) {
            res.status(404).json({ error: 'Storage provider not found' });
            return;
        }

        // Also clean up any file attachments linked to this provider if desired, or keep metadata
        res.json({ success: true, message: 'Storage provider deleted successfully' });
    } catch (err) {
        logger.error(`Error deleting storage provider ${req.params.id}:`, err);
        res.status(500).json({ error: 'Failed to delete storage provider' });
    }
};
