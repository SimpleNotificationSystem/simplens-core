import { Router } from 'express';
import {
    getActiveStorageProviderStatus,
    getAvailableStorageProviders,
    testStorageConnection,
    listStorageProviders,
    createStorageProvider,
    updateStorageProvider,
    activateStorageProvider,
    deleteStorageProvider,
} from '../controllers/storage.controller.js';

const router = Router();

// GET /api/storage/status - Check if an active storage provider is available
router.get('/status', getActiveStorageProviderStatus);

// GET /api/storage/providers - List available storage provider types and their schemas
router.get('/providers', getAvailableStorageProviders);

// POST /api/storage/test - Test storage connection
router.post('/test', testStorageConnection);

// GET /api/storage - List configured storage providers
router.get('/', listStorageProviders);

// POST /api/storage - Create a new storage provider
router.post('/', createStorageProvider);

// PATCH /api/storage/:id - Update storage provider
router.patch('/:id', updateStorageProvider);

// PATCH /api/storage/:id/activate - Promote as single active storage provider
router.patch('/:id/activate', activateStorageProvider);

// DELETE /api/storage/:id - Delete storage provider
router.delete('/:id', deleteStorageProvider);

export default router;
