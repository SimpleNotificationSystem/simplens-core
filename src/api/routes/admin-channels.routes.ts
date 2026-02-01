/**
 * Admin Channels Routes
 * 
 * Exposes admin channel provider metadata and test functionality for dashboard
 */

import { Router } from 'express';
import { getProviders, testConnection, validateConfig } from '../controllers/admin-channel.controller.js';

const router = Router();

// GET /admin-channels/providers - List available providers with schemas
router.get('/providers', getProviders);

// POST /admin-channels/test - Test channel connection
router.post('/test', testConnection);

// POST /admin-channels/validate - Validate config against schema
router.post('/validate', validateConfig);

export default router;
