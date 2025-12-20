/**
 * Plugins Routes
 * 
 * Exposes plugin metadata for dashboard
 */

import { Router } from 'express';
import { getPluginsMetadata } from '../controllers/plugins.controller.js';

const router = Router();

/**
 * GET /plugins
 * Returns available channels and their provider schemas
 */
router.get('/', getPluginsMetadata);

export default router;
