import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import storage_provider_model from '@src/database/models/storage-provider.models.js';
import { StorageService } from '@src/storage/storage.service.js';
import { createStreamingStorageEngine } from '@src/storage/streaming-storage-engine.js';
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
import type { FileAttachmentDoc } from '@src/types/types.js';

/**
 * Dynamic streaming file upload middleware.
 * Enforces preflight active provider check, dynamic size/count limits,
 * network interruption handling, and direct-to-storage streaming.
 */
export const fileUploadMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined;
        const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
        const limits = await StorageService.resolveEffectiveLimits(channel, provider);

        if (limits.enabled === false) {
            res.status(400).json({
                success: false,
                error: `File attachments are disabled for provider '${provider || channel || 'default'}'.`,
            });
            return;
        }

        if (req.headers['content-length'] === '0') {
            res.status(400).json({
                success: false,
                error: 'No files provided in upload request',
            });
            return;
        }

        let aborted = false;
        const onAbort = () => {
            aborted = true;
            logger.warn('Client disconnected or aborted file upload request');
        };
        req.on('aborted', onAbort);
        req.on('close', () => {
            if (!req.complete) {
                onAbort();
            }
        });

        const upload = multer({
            storage: createStreamingStorageEngine(),
            limits: {
                fileSize: limits.maxFileSize,
                files: limits.maxCount,
            },
            fileFilter: (_req, file, cb) => {
                if (limits.allowedMimeTypes && limits.allowedMimeTypes.length > 0) {
                    const allowed = limits.allowedMimeTypes.some((pattern) => {
                        if (pattern === '*/*' || pattern === '*') return true;
                        if (pattern.endsWith('/*')) {
                            return file.mimetype.startsWith(pattern.slice(0, -2));
                        }
                        return file.mimetype === pattern;
                    });
                    if (!allowed) {
                        return cb(
                            new Error(
                                `File '${file.originalname}' has unsupported MIME type '${file.mimetype}'. Allowed types: ${limits.allowedMimeTypes.join(', ')}`
                            )
                        );
                    }
                }
                cb(null, true);
            },
        }).any();

        upload(req, res, (err: unknown) => {
            if (aborted) {
                res.status(400).json({
                    success: false,
                    error: 'Upload aborted by client or network interruption',
                });
                return;
            }

            if (err) {
                // Drain any unread bytes from incoming request to avoid TCP RST
                if (!req.complete) {
                    req.on('data', () => {});
                    req.resume();
                }

                // Catch unexpected form termination (e.g. empty multipart form data from client)
                const isUnexpectedEnd = err instanceof Error && (
                    err.message.includes('Unexpected end of form') ||
                    err.message.includes('Unexpected end of multipart data')
                );
                if (isUnexpectedEnd) {
                    res.status(400).json({
                        success: false,
                        error: 'No files provided in upload request',
                    });
                    return;
                }

                // Check for file size limit exceeded
                const isSizeLimit = (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE')
                    || (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
                    || (err instanceof Error && (
                        err.message.includes('File too large') ||
                        err.message.includes('exceeds maximum size limit') ||
                        err.message.includes('maxFileSize exceeded')
                    ));

                if (isSizeLimit) {
                    const maxMb = Math.floor(limits.maxFileSize / (1024 * 1024));
                    res.status(400).json({
                        success: false,
                        error: `File size exceeds maximum allowed limit of ${maxMb}MB (${limits.maxFileSize} bytes)`,
                    });
                    return;
                }

                // Check for file count limit exceeded
                const isCountLimit = (err instanceof multer.MulterError && (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'))
                    || (err as { code?: string }).code === 'LIMIT_FILE_COUNT'
                    || (err as { code?: string }).code === 'LIMIT_UNEXPECTED_FILE';

                if (isCountLimit) {
                    res.status(400).json({
                        success: false,
                        error: `Cannot upload more than ${limits.maxCount} files per request`,
                    });
                    return;
                }

                if (err instanceof multer.MulterError) {
                    res.status(400).json({
                        success: false,
                        error: err.message,
                    });
                    return;
                }

                const errMsg = err instanceof Error ? err.message : 'File upload failed';
                if (!errMsg.includes('unsupported MIME type') && !errMsg.includes('No active storage provider')) {
                    logger.error('File upload failed:', err);
                }

                res.status(400).json({
                    success: false,
                    error: errMsg,
                });
                return;
            }

            next();
        });
    } catch (err) {
        logger.error('Error in file upload middleware:', err);
        res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : 'Internal error initializing file upload',
        });
    }
};

/**
 * POST /api/file/upload
 * Returns metadata of files that have been directly streamed and persisted
 */
export const uploadFiles = async (req: Request, res: Response): Promise<void> => {
    try {
        const files = req.files as Array<Express.Multer.File & { attachmentDoc?: FileAttachmentDoc }> | undefined;
        if (!files || files.length === 0) {
            res.status(400).json({
                success: false,
                error: 'No files provided in upload request',
            });
            return;
        }

        const uploadedAttachments = files.map((file) => {
            const doc = file.attachmentDoc;
            return {
                id: doc?.file_id,
                filename: doc?.filename || file.originalname,
                mime_type: doc?.mime_type || file.mimetype,
                size: doc?.size ?? file.size ?? 0,
                hash: doc?.hash,
                url: doc?.url,
                created_at: doc?.created_at,
            };
        });

        res.status(200).json({
            success: true,
            files: uploadedAttachments,
        });
    } catch (err) {
        logger.error('Failed to process file upload response:', err);
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

        // Enforce single active provider: if this one is active, demote all others and ensure enabled
        const effectiveEnabled = is_active ? true : (enabled !== undefined ? enabled : true);
        if (is_active) {
            await storage_provider_model.updateMany({}, { is_active: false });
        }

        const newProvider = await storage_provider_model.create({
            name,
            provider_type,
            enabled: effectiveEnabled,
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
