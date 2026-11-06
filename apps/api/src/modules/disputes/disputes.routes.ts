import { Router } from 'express';
import { DisputesController } from './disputes.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@openproofpay/shared';

const router = Router();

// GET /api/disputes - List disputes for user
router.get('/', requireAuth, DisputesController.list);

// GET /api/disputes/:disputeId - Get single dispute
router.get('/:disputeId', requireAuth, DisputesController.getById);

// POST /api/tasks/:taskId/disputes - Handled in router or directly
router.post('/tasks/:taskId', requireAuth, DisputesController.create);

// POST /api/disputes/:disputeId/messages - Add counter-evidence / message
router.post('/:disputeId/messages', requireAuth, DisputesController.addMessage);

// POST /api/disputes/:disputeId/resolve - ADMIN only resolution gate
router.post('/:disputeId/resolve', requireAuth, requireRole([UserRole.ADMIN]), DisputesController.resolve);

export default router;
