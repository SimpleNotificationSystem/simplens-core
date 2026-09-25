/**
 * Admin Authentication & Setup Routes
 */

import { Router } from 'express';
import {
    signupAdmin,
    loginAdmin,
    logoutAdmin,
    getAuthStatus,
} from '../controllers/admin-auth.controller.js';

const router = Router();

// 1. Signup - Initial administrator account creation (only allowed if no admin exists)
router.post('/signup', signupAdmin);

// 2. Login - Verify administrator credentials and set session cookie
router.post('/login', loginAdmin);

// 3. Logout - Clear session cookie
router.post('/logout', logoutAdmin);

// Check if admin credentials are configured (used by onboarding / MCP server)
router.get('/status', getAuthStatus);


export default router;
