/**
 * Providers Controller
 * 
 * Manages provider configurations, credential testing, and lifecycle
 */

import { Request, Response } from 'express';
import { ProviderManagerService } from '@src/plugins/index.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

/**
 * GET /api/providers
 * List all configured providers
 */
export const listProviders = async (_req: Request, res: Response): Promise<void> => {
  try {
    const providers = await ProviderManagerService.listProviders();
    res.json({ providers });
  } catch (err) {
    logger.error('Error listing providers:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list providers'
    });
  }
};

/**
 * GET /api/providers/:id
 * Get single provider by ID
 */
export const getProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const includeDecrypted = req.query.include_decrypted === 'true';
    const provider = await ProviderManagerService.getProvider(req.params.id, includeDecrypted);

    if (!provider) {
      res.status(404).json({
        error: 'Not Found',
        message: `Provider '${req.params.id}' not found`
      });
      return;
    }

    res.json({ provider });
  } catch (err) {
    logger.error(`Error getting provider '${req.params.id}':`, err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve provider'
    });
  }
};

/**
 * POST /api/providers
 * Create a new provider instance
 */
export const createProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, plugin_name, credentials, priority, options, enabled } = req.body;

    if (!id || typeof id !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Provider id is required and must be a string'
      });
      return;
    }

    if (!plugin_name || typeof plugin_name !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'plugin_name is required'
      });
      return;
    }

    if (!credentials || typeof credentials !== 'object') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'credentials object is required'
      });
      return;
    }

    const provider = await ProviderManagerService.createProvider({
      id: id.trim(),
      plugin_name: plugin_name.trim(),
      credentials,
      priority: typeof priority === 'number' ? priority : 0,
      options: options || {},
      enabled: enabled !== false,
    });

    res.status(201).json({
      message: `Provider '${id}' created successfully`,
      provider
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error creating provider: ${message}`);
    const statusCode = message.includes('already exists') ? 409 : message.includes('not installed') ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to create provider',
      message
    });
  }
};

/**
 * PUT /api/providers/:id
 * Update an existing provider instance
 */
export const updateProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { credentials, priority, options, enabled } = req.body;

    const provider = await ProviderManagerService.updateProvider(req.params.id, {
      credentials,
      priority: typeof priority === 'number' ? priority : undefined,
      options,
      enabled: typeof enabled === 'boolean' ? enabled : undefined,
    });

    res.json({
      message: `Provider '${req.params.id}' updated successfully`,
      provider
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error updating provider '${req.params.id}': ${message}`);
    const statusCode = message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to update provider',
      message
    });
  }
};

/**
 * DELETE /api/providers/:id
 * Delete a provider instance
 */
export const deleteProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    await ProviderManagerService.deleteProvider(req.params.id);
    res.json({
      message: `Provider '${req.params.id}' deleted successfully`
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error deleting provider '${req.params.id}': ${message}`);
    const statusCode = message.includes('configured in channel') ? 400 : message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to delete provider',
      message
    });
  }
};

/**
 * POST /api/providers/test
 * Test provider connection / credentials
 */
export const testProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider_id, plugin_name, credentials, options } = req.body;

    const result = await ProviderManagerService.testProviderConnection({
      provider_id,
      plugin_name,
      credentials,
      options,
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error testing provider: ${message}`);
    res.status(500).json({
      success: false,
      message
    });
  }
};
