import { Router } from 'express';
import { AIVerificationController } from './ai-verification.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

const router = Router();

// Trigger verification analysis
router.post(
  '/tasks/:taskId/verify',
  requireAuth,
  AIVerificationController.triggerVerification
);

// Get latest verification report for a task
router.get(
  '/tasks/:taskId/verification-report',
  requireAuth,
  AIVerificationController.getTaskReport
);

// Get historical reports for a submission
router.get(
  '/submissions/:submissionId/verification-reports',
  requireAuth,
  AIVerificationController.getSubmissionReports
);

export default router;