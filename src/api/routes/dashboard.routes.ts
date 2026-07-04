import { Router } from 'express';
import {
  getDashboardStats,
  getDashboardTrends
} from '../controllers/dashboard.controller.js'; // Wait, let's verify if TS compilation uses .js extension! Yes, ES modules imports use .js extension. So dashboard.controller.js is correct. Let's write that.

const router = Router();

// GET /api/dashboard/stats - Get notification status & channel breakdown
router.get('/stats', getDashboardStats);

// GET /api/dashboard/trends - Get notification trends over time (24h, 7d, 30d)
router.get('/trends', getDashboardTrends);

export default router;
