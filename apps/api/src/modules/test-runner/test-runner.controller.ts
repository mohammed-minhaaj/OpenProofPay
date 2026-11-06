import { Request, Response, NextFunction } from 'express';
import { TestRunnerService } from './test-runner.service.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { AppError } from '../../errors/AppError.js';

export class TestRunnerController {
  /**
   * POST /api/tasks/:taskId/test
   * Trigger isolated test runner for task's latest submission
   */
  static async triggerTaskTests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { taskId } = req.params;
      const { submissionId: bodySubId, filesOverride } = req.body || {};
      const actorId = req.user?.userId;
      const actorRole = req.user?.role;
      const ipAddress = req.ip || req.socket.remoteAddress;

      let targetSubmissionId = bodySubId;

      if (!targetSubmissionId) {
        const latest = await PullRequestSubmissionModel.findOne({ taskId }).sort({ createdAt: -1 });
        if (!latest) {
          throw AppError.notFound('No PR submissions found for this milestone task to test');
        }
        targetSubmissionId = latest._id.toString();
      }

      const execution = await TestRunnerService.executeSubmissionTests(targetSubmissionId, {
        actorId,
        actorRole,
        ipAddress,
        filesOverride
      });

      res.status(200).json({
        success: true,
        data: execution,
        message: `Isolated test execution completed: ${execution.status}`
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/submissions/:submissionId/test
   * Trigger isolated test runner for specific submission
   */
  static async triggerSubmissionTests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { submissionId } = req.params;
      const { filesOverride } = req.body || {};
      const actorId = req.user?.userId;
      const actorRole = req.user?.role;
      const ipAddress = req.ip || req.socket.remoteAddress;

      const execution = await TestRunnerService.executeSubmissionTests(submissionId!, {
        actorId,
        actorRole,
        ipAddress,
        filesOverride
      });

      res.status(200).json({
        success: true,
        data: execution,
        message: `Isolated test execution completed: ${execution.status}`
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tasks/:taskId/test-execution
   * Get latest test execution record for task
   */
  static async getTaskTestExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { taskId } = req.params;
      const execution = await TestRunnerService.getLatestExecutionForTask(taskId!);

      if (!execution) {
        throw AppError.notFound('No test execution record found for this task');
      }

      res.status(200).json({
        success: true,
        data: execution
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/submissions/:submissionId/test-execution
   * Get test execution record for specific submission
   */
  static async getSubmissionTestExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { submissionId } = req.params;
      const execution = await TestRunnerService.getExecutionForSubmission(submissionId!);

      if (!execution) {
        throw AppError.notFound('No test execution record found for this submission');
      }

      res.status(200).json({
        success: true,
        data: execution
      });
    } catch (err) {
      next(err);
    }
  }
}
