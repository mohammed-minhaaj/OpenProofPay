import { Router } from 'express';
import { NotificationController } from './notifications.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

const router = Router();

// GET /api/notifications/stream - Real-time Server-Sent Events stream
router.get('/stream', requireAuth, NotificationController.stream);

// GET /api/notifications - List user notifications
router.get('/', requireAuth, NotificationController.list);

// PATCH /api/notifications/:id/read - Mark single notification as read
router.patch('/:id/read', requireAuth, NotificationController.markRead);

// POST /api/notifications/read-all - Mark all notifications as read
router.post('/read-all', requireAuth, NotificationController.markAllRead);

export default router;
