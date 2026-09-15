/**
 * Plugins Controller
 * 
 * Exposes plugin metadata, package management, and status
 */

import { Request, Response } from 'express';
import { PluginRegistry, PluginManagerService } from '@src/plugins/index.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';
import axios from 'axios';
import type { plugin_catalog_entry } from '@src/types/types.js';

const PLUGIN_CATALOG_BASE_URL = 'https://www.simplens.in/plugins';

/**
 * GET /api/plugins
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

/**
 * GET /api/plugins/installed
 * List all installed npm plugins in MongoDB
 */
export const listInstalledPlugins = async (_req: Request, res: Response): Promise<void> => {
  try {
    const plugins = await PluginManagerService.listInstalledPlugins();
    res.json({ plugins });
  } catch (err) {
    logger.error('Error listing installed plugins:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list installed plugins'
    });
  }
};

/**
 * GET /api/plugins/catalog/:category
 * Proxy the public plugin catalog server-side to avoid browser CORS restrictions.
 */
export const listPluginCatalog = async (req: Request, res: Response): Promise<void> => {
  const category = req.params.category;
  if (category !== 'official' && category !== 'community') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Catalog category must be official or community',
    });
    return;
  }

  try {
    const response = await axios.get<plugin_catalog_entry[]>(
      `${PLUGIN_CATALOG_BASE_URL}/${category}`,
      { timeout: 10000 }
    );
    const catalog = Array.isArray(response.data) ? response.data : [];
    res.json(catalog);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error loading ${category} plugin catalog: ${message}`);
    res.status(502).json({
      error: 'Bad Gateway',
      message: `Failed to load ${category} plugin catalog`,
    });
  }
};

/**
 * POST /api/plugins/install
 * Install an npm plugin package
 */
export const installPlugin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { package: packageName, version } = req.body;
    if (!packageName || typeof packageName !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'A valid npm package name is required'
      });
      return;
    }

    const plugin = await PluginManagerService.installPlugin(packageName.trim(), version);
    res.status(201).json({
      message: `Plugin '${packageName}' installed successfully`,
      plugin
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error installing plugin: ${message}`);
    res.status(500).json({
      error: 'Failed to install plugin',
      message
    });
  }
};

/**
 * PUT /api/plugins/version
 * Upgrade or downgrade an installed plugin
 */
export const changePluginVersion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { package: packageName, version } = req.body;
    if (!packageName || !version) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Both package name and target version are required'
      });
      return;
    }

    const plugin = await PluginManagerService.changePluginVersion(packageName.trim(), version.trim());
    res.json({
      message: `Plugin '${packageName}' changed to version '${version}'`,
      plugin
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error changing plugin version: ${message}`);
    res.status(500).json({
      error: 'Failed to change plugin version',
      message
    });
  }
};

/**
 * DELETE /api/plugins/:package
 * Uninstall an installed plugin
 */
export const uninstallPlugin = async (req: Request, res: Response): Promise<void> => {
  try {
    let packageName = (req.query.package as string) || (req.body?.package as string);

    if (!packageName) {
      if (req.params.scope && req.params.package) {
        packageName = `${req.params.scope}/${req.params.package}`;
      } else if (req.params.package) {
        packageName = decodeURIComponent(req.params.package);
      }
    }

    if (!packageName || typeof packageName !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'A valid npm package name is required'
      });
      return;
    }

    await PluginManagerService.uninstallPlugin(packageName.trim());
    res.json({
      message: `Plugin '${packageName.trim()}' uninstalled successfully`
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error uninstalling plugin: ${message}`);
    const statusCode = message.includes('depend on it') ? 400 : 500;
    res.status(statusCode).json({
      error: 'Failed to uninstall plugin',
      message
    });
  }
};
