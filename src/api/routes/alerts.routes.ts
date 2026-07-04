import { Router } from 'express';
import {
  listAlerts,
  dismissAlert,
  resolveAlert,
  bulkResolveAlerts
} from '../controllers/alerts.controller.js';

const router = Router();

// GET /api/alerts - List all unresolved alerts (paginated, type-filtered)
router.get('/', listAlerts);

// DELETE /api/alerts/:id - Dismiss alert (without retry)
router.delete('/:id', dismissAlert);

// POST /api/alerts/:id/resolve - Resolve alert (with retry)
router.post('/:id/resolve', resolveAlert);

// POST /api/alerts/bulk-resolve - Bulk resolve alerts
router.post('/bulk-resolve', bulkResolveAlerts);

export default router;
