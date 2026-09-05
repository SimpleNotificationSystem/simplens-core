import { Router } from 'express';
import {
  getDashboardStats,
  getDashboardTrends
} from '../controllers/dashboard.controller.js';

const router = Router();

// GET /api/dashboard/stats - Get notification status & channel breakdown
router.get('/stats', getDashboardStats);

// GET /api/dashboard/trends - Get notification trends over time (24h, 7d, 30d)
router.get('/trends', getDashboardTrends);

export default router;
