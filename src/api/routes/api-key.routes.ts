/**
 * API Key Management Routes
 */

import { Router } from 'express';
import {
    listApiKeys,
    createApiKey,
    getApiKeyUsage,
    revokeApiKey,
    deleteApiKey,
} from '../controllers/api-key.controller.js';

const router = Router();

// GET /api/keys - List all keys
router.get('/', listApiKeys);

// POST /api/keys - Create a new key
router.post('/', createApiKey);

// GET /api/keys/:id - Get usage and details for a key
router.get('/:id', getApiKeyUsage);

// POST /api/keys/:id/revoke - Revoke a key
router.post('/:id/revoke', revokeApiKey);

// DELETE /api/keys/:id - Delete a key
router.delete('/:id', deleteApiKey);

export default router;
