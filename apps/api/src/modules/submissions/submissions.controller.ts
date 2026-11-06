import { Request, Response, NextFunction } from 'express';
import { SubmissionsService } from './submissions.service.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { AIVerificationService } from '../ai-verification/ai-verification.service.js';
import { AppError } from '../../errors/AppError.js';
import { z } from 'zod';

const SubmitPrBodySchema = z.object({
  prUrl: z.string().url(),
  prNumber: z.number().int().positive().optional()
});

export class SubmissionsController {
  static async submitPR(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      const taskId = req.params.taskId;
      if (!taskId) throw AppError.badRequest('Task ID is required');

      const validated = SubmitPrBodySchema.parse(req.body);

      const submission = await SubmissionsService.submitPR(
        {
          taskId,
          developerId: req.user.userId,
          prUrl: validated.prUrl,
          prNumber: validated.prNumber
        },
        req.ip
      );

      // Asynchronously trigger AI verification and test pipeline for manual submission
      AIVerificationService.verifySubmission(
        submission._id.toString(),
        req.user.userId,
        req.user.role,
        req.ip
      ).catch((err) => {
        console.error(`[AIVerificationService] Background verification failed for submission ${submission._id}:`, err);
      });

      res.status(201).json({
        success: true,
        data: submission,
        message: 'Pull Request submitted and queued for AI verification and automated testing'
      });
    } catch (err) {
      next(err);
    }
  }

  static async listSubmissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      const taskId = req.query.taskId as string;
      const filter = taskId ? { taskId } : {};

      const submissions = await PullRequestSubmissionModel.find(filter)
        .sort({ submittedAt: -1 })
        .limit(50);

      res.status(200).json({
        success: true,
        data: submissions
      });
    } catch (err) {
      next(err);
    }
  }

  static async getSubmission(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      const { id } = req.params;

      const submission = await PullRequestSubmissionModel.findById(id);
      if (!submission) throw AppError.notFound('Submission not found');

      res.status(200).json({
        success: true,
        data: submission
      });
    } catch (err) {
      next(err);
    }
  }
}
