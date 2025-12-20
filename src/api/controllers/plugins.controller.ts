/**
 * Plugins Controller
 * 
 * Exposes plugin metadata for dashboard dynamic form generation
 */

import { Request, Response } from 'express';
import { PluginRegistry } from '@src/plugins/index.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

/**
 * GET /plugins
 * Returns available channels and their provider schemas
 */
export const getPluginsMetadata = async (_req: Request, res: Response): Promise<void> => {
    try {
        if (!PluginRegistry.isInitialized()) {
            res.status(503).json({
                error: 'Plugin system not initialized',
                message: 'The plugin system has not been initialized yet. Ensure providers are loaded.'
            });
            return;
        }

        const metadata = PluginRegistry.getPluginMetadata();
        res.json(metadata);
    } catch (err) {
        logger.error('Error getting plugin metadata:', err);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve plugin metadata'
        });
    }
};
