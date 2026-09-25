/**
 * API Key Management Controller
 * 
 * Handles creation, listing, revocation, deletion, and usage aggregation
 * for external service API keys.
 */

import type { Request, Response } from 'express';
import crypto from 'crypto';
import api_key_model from '@src/database/models/api-key.models.js';
import notification_model from '@src/database/models/notification.models.js';
import { createApiKeySchema } from '@src/types/schemas.js';
import type { ApiKeyDoc, ApiKeyResponse } from '@src/types/types.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

/**
 * Format an API Key document for API response (strips secret hash)
 */
function toApiKeyResponse(doc: ApiKeyDoc): ApiKeyResponse {
    return {
        key_id: doc.key_id,
        name: doc.name,
        key_prefix: doc.key_prefix,
        status: doc.status,
        expires_at: doc.expires_at || null,
        usage: {
            total_requests: doc.usage?.total_requests || 0,
            total_notifications: doc.usage?.total_notifications || 0,
            by_channel: doc.usage?.by_channel instanceof Map
                ? Object.fromEntries(doc.usage.by_channel)
                : (doc.usage?.by_channel || {}),
            last_used_at: doc.usage?.last_used_at || null,
        },
        created_at: doc.created_at || new Date(),
    };
}

/**
 * GET /api/keys - List all API keys
 */
export const listApiKeys = async (_req: Request, res: Response): Promise<void> => {
    try {
        const keys = await api_key_model.find().sort({ created_at: -1 });
        const responseKeys = keys.map((k) => toApiKeyResponse(k.toObject() as ApiKeyDoc));
        res.status(200).json({ keys: responseKeys });
    } catch (err) {
        logger.error('Failed to list API keys', err);
        res.status(500).json({ error: 'Failed to retrieve API keys' });
    }
};

/**
 * POST /api/keys - Create a new API key
 */
export const createApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = createApiKeySchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                error: 'Validation failed',
                details: validation.error.flatten().fieldErrors,
            });
            return;
        }

        const { name, expires_at } = validation.data;

        // Generate cryptographically random API key
        const rawKey = `sns_live_${crypto.randomBytes(24).toString('base64url')}`;
        const key_prefix = `${rawKey.slice(0, 16)}...`;
        const key_hash = crypto.createHash('sha256').update(rawKey).digest('hex');
        const key_id = `ak_${crypto.randomUUID()}`;

        const newDoc = await api_key_model.create({
            key_id,
            name,
            key_prefix,
            key_hash,
            status: 'active',
            expires_at: expires_at || null,
            usage: {
                total_requests: 0,
                total_notifications: 0,
                by_channel: {},
                last_used_at: null,
            },
        });

        logger.success(`Created new API key: ${name} (${key_id})`);

        res.status(201).json({
            key: toApiKeyResponse(newDoc.toObject() as ApiKeyDoc),
            raw_key: rawKey,
        });
    } catch (err) {
        logger.error('Failed to create API key', err);
        res.status(500).json({ error: 'Failed to create API key' });
    }
};

/**
 * GET /api/keys/:id - Get single API key details & notification status breakdown
 */
export const getApiKeyUsage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const key = await api_key_model.findOne({ key_id: id });

        if (!key) {
            res.status(404).json({ error: 'API key not found' });
            return;
        }

        // Aggregate delivery outcomes from notifications collection
        const statusBreakdown = await notification_model.aggregate([
            { $match: { api_key_id: id } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        const statusCounts: Record<string, number> = {
            pending: 0,
            processing: 0,
            delivered: 0,
            failed: 0,
        };

        for (const item of statusBreakdown) {
            if (item._id && typeof item.count === 'number') {
                statusCounts[item._id] = item.count;
            }
        }

        res.status(200).json({
            key: toApiKeyResponse(key.toObject() as ApiKeyDoc),
            status_breakdown: statusCounts,
        });
    } catch (err) {
        logger.error(`Failed to get API key usage for ${req.params.id}`, err);
        res.status(500).json({ error: 'Failed to retrieve API key usage' });
    }
};

/**
 * POST /api/keys/:id/revoke - Revoke an API key
 */
export const revokeApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const key = await api_key_model.findOneAndUpdate(
            { key_id: id },
            { $set: { status: 'revoked' } },
            { new: true }
        );

        if (!key) {
            res.status(404).json({ error: 'API key not found' });
            return;
        }

        logger.info(`Revoked API key: ${key.name} (${id})`);
        res.status(200).json({
            success: true,
            message: 'API key has been revoked successfully',
            key: toApiKeyResponse(key.toObject() as ApiKeyDoc),
        });
    } catch (err) {
        logger.error(`Failed to revoke API key ${req.params.id}`, err);
        res.status(500).json({ error: 'Failed to revoke API key' });
    }
};

/**
 * DELETE /api/keys/:id - Permanently delete an API key
 */
export const deleteApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const result = await api_key_model.deleteOne({ key_id: id });

        if (result.deletedCount === 0) {
            res.status(404).json({ error: 'API key not found' });
            return;
        }

        logger.info(`Deleted API key (${id})`);
        res.status(200).json({
            success: true,
            message: 'API key deleted successfully',
        });
    } catch (err) {
        logger.error(`Failed to delete API key ${req.params.id}`, err);
        res.status(500).json({ error: 'Failed to delete API key' });
    }
};
