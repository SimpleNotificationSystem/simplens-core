import { Router } from 'express';
import {
  listNotifications,
  getRecentNotifications,
  getNotificationById,
  deleteNotification,
  retryNotification
} from '../controllers/notifications-management.controller.js';

const router = Router();

// GET /api/notifications - List all notifications (paginated, sorted, filtered)
router.get('/', listNotifications);

// GET /api/notifications/recent - Activity feed
router.get('/recent', getRecentNotifications);

// GET /api/notifications/:id - Fetch single notification
router.get('/:id', getNotificationById);

// DELETE /api/notifications/:id - Delete single notification
router.delete('/:id', deleteNotification);

// POST /api/notifications/:id/retry - Retry failed notification
router.post('/:id/retry', retryNotification);

export default router;
