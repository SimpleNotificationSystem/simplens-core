/**
 * Admin Channels Controller
 * 
 * Handles admin channel provider metadata and test functionality
 */

import type { Request, Response } from 'express';
import { getAdminChannelMetadata, getChannelProvider, hasChannelProvider } from '@src/admin-alerts/channel-registry.js';
import type { AdminChannelType } from '@src/types/types.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

/**
 * GET /admin-channels/providers
 * Returns available admin channel providers with their credential schemas
 */
export const getProviders = (_req: Request, res: Response): void => {
    try {
        const providers = getAdminChannelMetadata();
        res.json({ providers });
    } catch (err) {
        logger.error('Error getting admin channel providers:', err);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve admin channel providers'
        });
    }
};

/**
 * POST /admin-channels/test
 * Test a channel connection with provided config
 * Body: { channel_type: string, config: object }
 */
export const testConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const { channel_type, config } = req.body;

        if (!channel_type || !config) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: channel_type, config'
            });
            return;
        }

        // Check if provider exists
        if (!hasChannelProvider(channel_type as AdminChannelType)) {
            res.status(400).json({
                success: false,
                error: `Unsupported channel type: ${channel_type}`
            });
            return;
        }

        // Get provider instance and test connection
        const provider = getChannelProvider(channel_type as AdminChannelType, config);
        const result = await provider.testConnection();

        if (result.success) {
            res.json({ success: true, message: 'Test message sent successfully!' });
        } else {
            res.json({ success: false, error: result.error || 'Test failed' });
        }
    } catch (err) {
        logger.error('Error testing admin channel:', err);
        res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : 'Test failed'
        });
    }
};

/**
 * POST /admin-channels/validate
 * Validate config against provider's credential schema
 * Body: { channel_type: string, config: object }
 */
export const validateConfig = (req: Request, res: Response): void => {
    try {
        const { channel_type, config } = req.body;

        if (!channel_type || !config) {
            res.status(400).json({
                valid: false,
                errors: ['Missing required fields: channel_type, config']
            });
            return;
        }

        if (!hasChannelProvider(channel_type as AdminChannelType)) {
            res.status(400).json({
                valid: false,
                errors: [`Unsupported channel type: ${channel_type}`]
            });
            return;
        }

        // Get provider and validate against schema
        const provider = getChannelProvider(channel_type as AdminChannelType, config);
        const schema = provider.getCredentialSchema();
        const errors: string[] = [];

        for (const field of schema) {
            const value = config[field.name];
            
            // Check required
            if (field.required && (!value || value.trim() === '')) {
                errors.push(`${field.label} is required`);
                continue;
            }

            // Check pattern
            if (value && field.pattern) {
                const regex = new RegExp(field.pattern);
                if (!regex.test(value)) {
                    errors.push(`${field.label} has invalid format`);
                }
            }
        }

        if (errors.length > 0) {
            res.json({ valid: false, errors });
        } else {
            res.json({ valid: true });
        }
    } catch (err) {
        logger.error('Error validating admin channel config:', err);
        res.status(500).json({
            valid: false,
            errors: [err instanceof Error ? err.message : 'Validation failed']
        });
    }
};
