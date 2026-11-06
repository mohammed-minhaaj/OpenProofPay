import { Router } from 'express';
import { TestRunnerController } from './test-runner.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

const router = Router();

// Test Execution Endpoints
router.post('/tasks/:taskId/test', requireAuth, TestRunnerController.triggerTaskTests);
router.post('/submissions/:submissionId/test', requireAuth, TestRunnerController.triggerSubmissionTests);

router.get('/tasks/:taskId/test-execution', requireAuth, TestRunnerController.getTaskTestExecution);
router.get('/submissions/:submissionId/test-execution', requireAuth, TestRunnerController.getSubmissionTestExecution);

export default router;
