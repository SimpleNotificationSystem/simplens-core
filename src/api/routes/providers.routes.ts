/**
 * Providers Routes
 * 
 * Endpoints for managing provider instances and testing connections
 */

import { Router } from 'express';
import {
  listProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,
  testProvider,
} from '../controllers/providers.controller.js';

const router = Router();

router.get('/', listProviders);
router.post('/test', testProvider);
router.get('/:id', getProvider);
router.post('/', createProvider);
router.put('/:id', updateProvider);
router.delete('/:id', deleteProvider);

export default router;
