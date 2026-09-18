/**
 * Admin Authentication & Setup Routes
 */

import { Router } from 'express';
import { getAuthStatus, setupAdmin, verifyAdmin } from '../controllers/admin-auth.controller.js';

const router = Router();

// GET /api/admin/auth/status - Check if admin credentials are configured
router.get('/status', getAuthStatus);

// POST /api/admin/auth/setup - Initial administrator configuration
router.post('/setup', setupAdmin);

// POST /api/admin/auth/verify - Verify administrator credentials
router.post('/verify', verifyAdmin);

export default router;
