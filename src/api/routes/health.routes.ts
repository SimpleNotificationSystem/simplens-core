import { Router } from 'express';
import { getHealth, getLiveness, getReadiness } from '../controllers/health.controller.js';

const router = Router();

// GET /api/health
router.get('/health', getHealth);

// GET /api/healthz (liveness)
router.get('/healthz', getLiveness);

// GET /api/readyz (readiness)
router.get('/readyz', getReadiness);

export default router;
