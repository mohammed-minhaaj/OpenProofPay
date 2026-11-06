import { Router } from 'express';
import { SubmissionsController } from './submissions.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@openproofpay/shared';

const router = Router();

router.get('/submissions', requireAuth, SubmissionsController.listSubmissions);
router.get('/submissions/:id', requireAuth, SubmissionsController.getSubmission);
router.post(
  '/tasks/:taskId/submissions',
  requireAuth,
  requireRole([UserRole.DEVELOPER, UserRole.ADMIN]),
  SubmissionsController.submitPR
);

export default router;
