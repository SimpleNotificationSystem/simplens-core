/**
 * Dynamic Operational Settings Controller
 * 
 * Handles reading, updating, and resetting operational configuration settings.
 */

import { Request, Response } from 'express';
import { dynamicConfig } from '@src/config/dynamic-config.service.js';
import { partialOperationalSettingsSchema } from '@src/types/schemas.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

/**
 * Get current operational settings
 * GET /api/settings
 */
export const getSettings = async (_req: Request, res: Response): Promise<void> => {
    try {
        const settings = dynamicConfig.getAll();
        res.status(200).json({
            success: true,
            settings,
        });
    } catch (err) {
        logger.error('Failed to retrieve operational settings', err);
        res.status(500).json({ error: 'Failed to retrieve operational settings' });
    }
};

/**
 * Update operational settings
 * PUT /api/settings
 */
export const updateSettings = async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = partialOperationalSettingsSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                error: 'Validation failed',
                details: validation.error.flatten().fieldErrors,
            });
            return;
        }

        const updatedSettings = await dynamicConfig.updateSettings(validation.data);
        logger.success('Operational settings updated and broadcasted');

        res.status(200).json({
            success: true,
            message: 'Operational settings updated and broadcasted successfully',
            settings: updatedSettings,
        });
    } catch (err) {
        logger.error('Failed to update operational settings', err);
        res.status(500).json({ error: 'Failed to update operational settings' });
    }
};

/**
 * Reset operational settings to system defaults
 * POST /api/settings/reset
 */
export const resetSettings = async (_req: Request, res: Response): Promise<void> => {
    try {
        const reset = await dynamicConfig.resetSettings();
        logger.info('Operational settings reset to system defaults and broadcasted');

        res.status(200).json({
            success: true,
            message: 'Operational settings reset to system defaults successfully',
            settings: reset,
        });
    } catch (err) {
        logger.error('Failed to reset operational settings', err);
        res.status(500).json({ error: 'Failed to reset operational settings' });
    }
};
