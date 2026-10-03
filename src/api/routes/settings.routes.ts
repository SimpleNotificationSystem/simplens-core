/**
 * Dynamic Operational Settings Routes
 */

import { Router } from 'express';
import { getSettings, updateSettings, resetSettings } from '../controllers/settings.controller.js';

const router = Router();

// GET /api/settings - Retrieve current active settings
router.get('/', getSettings);

// PUT /api/settings - Update operational settings
router.put('/', updateSettings);

// POST /api/settings/reset - Reset operational settings to system defaults
router.post('/reset', resetSettings);

export default router;
