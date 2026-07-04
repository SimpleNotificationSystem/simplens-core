/**
 * Admin Channels Routes
 * 
 * Exposes admin channel provider metadata and test functionality for dashboard
 */

import { Router } from 'express';
import { getProviders, testConnection, validateConfig } from '../controllers/admin-channel.controller.js';
import {
  listAdminChannels,
  createAdminChannel,
  getAdminChannelById,
  updateAdminChannel,
  deleteAdminChannel
} from '../controllers/admin-channels-crud.controller.js';

const router = Router();

// GET /admin-channels/providers - List available providers with schemas
router.get('/providers', getProviders);

// POST /admin-channels/test - Test channel connection
router.post('/test', testConnection);

// POST /admin-channels/validate - Validate config against schema
router.post('/validate', validateConfig);

// GET /admin-channels - List all channels
router.get('/', listAdminChannels);

// POST /admin-channels - Create new channel
router.post('/', createAdminChannel);

// GET /admin-channels/:id - Get single channel
router.get('/:id', getAdminChannelById);

// PATCH /admin-channels/:id - Update channel
router.patch('/:id', updateAdminChannel);

// DELETE /admin-channels/:id - Delete channel
router.delete('/:id', deleteAdminChannel);

export default router;
