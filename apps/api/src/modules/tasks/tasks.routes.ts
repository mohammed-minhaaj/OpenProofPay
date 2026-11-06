import { Router } from 'express';
import { TasksController } from './tasks.controller.js';
import { SubmissionsController } from '../submissions/submissions.controller.js';
import { AIVerificationController } from '../ai-verification/ai-verification.controller.js';
import { TestRunnerController } from '../test-runner/test-runner.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@openproofpay/shared';

const router = Router();

// Create Task (Employer or Admin only)
router.post(
  '/',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  TasksController.createTask
);

// List Tasks (Authenticated users)
router.get(
  '/',
  requireAuth,
  TasksController.listTasks
);

// Get Task details
router.get(
  '/:id',
  requireAuth,
  TasksController.getTaskById
);

// Start / Claim Task (Developer explicit claim or beginning work)
router.post(
  '/:id/start',
  requireAuth,
  requireRole([UserRole.DEVELOPER, UserRole.ADMIN]),
  TasksController.startTask
);
router.post(
  '/:id/claim',
  requireAuth,
  requireRole([UserRole.DEVELOPER, UserRole.ADMIN]),
  TasksController.startTask
);

// Employer Review Gate
router.post(
  '/:id/review',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  TasksController.reviewTask
);

// Aliases for extension/client convenience
router.post(
  '/:id/approve',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  TasksController.approveTask
);

router.post(
  '/:id/request-revision',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  TasksController.requestRevision
);

// Milestone PR Submissions
router.post(
  '/:taskId/submissions',
  requireAuth,
  requireRole([UserRole.DEVELOPER, UserRole.ADMIN]),
  SubmissionsController.submitPR
);

// Trigger AI verification analysis
router.post(
  '/:taskId/verify',
  requireAuth,
  AIVerificationController.triggerVerification
);

// Get latest verification report for a task
router.get(
  '/:taskId/verification-report',
  requireAuth,
  AIVerificationController.getTaskReport
);

// Trigger test runner execution
router.post(
  '/:taskId/test',
  requireAuth,
  TestRunnerController.triggerTaskTests
);

// Get test execution for a task
router.get(
  '/:taskId/test-execution',
  requireAuth,
  TestRunnerController.getTaskTestExecution
);

export default router;