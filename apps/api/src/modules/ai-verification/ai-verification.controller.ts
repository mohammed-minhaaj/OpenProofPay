import { Request, Response, NextFunction } from 'express';
import { AIVerificationService } from './ai-verification.service.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { TaskModel } from '../../models/Task.js';
import { AppError } from '../../errors/AppError.js';
import { UserRole } from '@openproofpay/shared';

export class AIVerificationController {
  /**
   * POST /api/tasks/:taskId/verify
   * Trigger AI Verification analysis on latest PR submission
   */
  static async triggerVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { taskId } = req.params;
      const { submissionId: bodySubId } = req.body || {};
      const user = req.user;
      if (!user) {
        throw AppError.unauthorized('Authentication required');
      }

      const actorId = user.userId;
      const actorRole = user.role;
      const ipAddress = req.ip || req.socket.remoteAddress;

      let targetSubmissionId = bodySubId;

      if (!targetSubmissionId) {
        // Find latest submission for this task
        const latest = await PullRequestSubmissionModel.findOne({ taskId })
          .sort({ createdAt: -1 });

        if (!latest) {
          throw AppError.notFound('No PR submissions found for this milestone task to verify');
        }
        targetSubmissionId = latest._id.toString();
      }

      // Check developer permissions: can only trigger verification for own submissions
      if (user.role === UserRole.DEVELOPER) {
        const submission = await PullRequestSubmissionModel.findById(targetSubmissionId);
        if (!submission || submission.developerId.toString() !== user.userId) {
          throw AppError.forbidden(
            'Access denied: You can only trigger verification for your own submissions',
            'FORBIDDEN_VERIFICATION_TRIGGER'
          );
        }
      }

      const report = await AIVerificationService.verifySubmission(
        targetSubmissionId,
        actorId,
        actorRole,
        ipAddress
      );

      res.status(200).json({
        success: true,
        data: report,
        message: 'AI Verification analysis completed successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tasks/:taskId/verification-report
   * Get latest active AI Verification Report for task
   */
  static async getTaskReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { taskId } = req.params;
      const user = req.user;

      if (!user) {
        throw AppError.unauthorized('Authentication required');
      }

      // Authorization / Anti-IDOR check
      if (user.role !== UserRole.ADMIN) {
        const task = await TaskModel.findById(taskId);
        if (!task) {
          throw AppError.notFound('Milestone task not found');
        }

        if (user.role === UserRole.DEVELOPER) {
          const isAssigned = task.assignedDeveloperId?.toString() === user.userId;
          let hasSubmission = false;
          if (!isAssigned) {
            hasSubmission = !!(await PullRequestSubmissionModel.exists({
              taskId: task._id,
              developerId: user.userId
            }));
          }
          if (!isAssigned && !hasSubmission) {
            throw AppError.forbidden(
              'Access denied: You can only view verification reports for your own tasks or submissions',
              'FORBIDDEN_REPORT_ACCESS'
            );
          }
        } else if (user.role === UserRole.EMPLOYER) {
          if (task.employerId.toString() !== user.userId) {
            throw AppError.forbidden(
              'Access denied: You can only view verification reports for tasks you posted',
              'FORBIDDEN_REPORT_ACCESS'
            );
          }
        }
      }

      const report = await AIVerificationService.getLatestReportForTask(taskId!);

      if (!report) {
        throw AppError.notFound('No verification report found for this task');
      }

      res.status(200).json({
        success: true,
        data: report
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/submissions/:submissionId/verification-reports
   * Get all reports (current and outdated historical reports) for a submission
   */
  static async getSubmissionReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { submissionId } = req.params;
      const user = req.user;

      if (!user) {
        throw AppError.unauthorized('Authentication required');
      }

      if (user.role !== UserRole.ADMIN) {
        const submission = await PullRequestSubmissionModel.findById(submissionId);
        if (!submission) {
          throw AppError.notFound('Submission not found');
        }

        if (user.role === UserRole.DEVELOPER) {
          if (submission.developerId.toString() !== user.userId) {
            throw AppError.forbidden(
              'Access denied: You can only view verification reports for your own submissions',
              'FORBIDDEN_REPORT_ACCESS'
            );
          }
        } else if (user.role === UserRole.EMPLOYER) {
          const task = await TaskModel.findById(submission.taskId);
          if (task && task.employerId.toString() !== user.userId) {
            throw AppError.forbidden(
              'Access denied: You can only view verification reports for tasks you posted',
              'FORBIDDEN_REPORT_ACCESS'
            );
          }
        }
      }

      const reports = await AIVerificationService.getReportsForSubmission(submissionId!);

      res.status(200).json({
        success: true,
        data: reports
      });
    } catch (err) {
      next(err);
    }
  }
}