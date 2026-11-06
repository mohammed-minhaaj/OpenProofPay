import { Request, Response, NextFunction } from 'express';
import { TasksService } from './tasks.service.js';
import { CreateTaskSchema, ReviewTaskSchema, TaskReviewAction } from '@openproofpay/shared';

export class TasksController {
  /**
   * POST /api/tasks
   * Create task (manual or from GitHub Issue)
   */
  static async createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = CreateTaskSchema.parse(req.body);
      const employerId = req.user!.userId;
      const ipAddress = req.ip || req.socket.remoteAddress;

      const task = await TasksService.createTask(employerId, validated, ipAddress);

      res.status(201).json({
        success: true,
        data: task,
        message: 'Milestone task created successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tasks
   * List tasks with filters
   */
  static async listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { projectId, status, assignedDeveloperId, employerId, search } = req.query;
      const currentUserId = req.user!.userId;
      const currentUserRole = req.user!.role;

      const tasks = await TasksService.listTasks(
        {
          projectId: projectId as string,
          status: status as any,
          assignedDeveloperId: assignedDeveloperId as string,
          employerId: employerId as string,
          search: search as string
        },
        currentUserId,
        currentUserRole
      );

      res.status(200).json({
        success: true,
        data: tasks
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tasks/:id
   * Get single task with submission history and criteria
   */
  static async getTaskById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await TasksService.getTaskById(id!);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tasks/:id/start
   * Developer starts work: ASSIGNED -> IN_PROGRESS
   */
  static async startTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const developerId = req.user!.userId;
      const ipAddress = req.ip || req.socket.remoteAddress;

      const task = await TasksService.startTask(id!, developerId, ipAddress);

      res.status(200).json({
        success: true,
        data: task,
        message: 'Task successfully marked IN_PROGRESS'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tasks/:id/review
   * Employer Review Gate (APPROVE, REQUEST_REVISION, REJECT)
   */
  static async reviewTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const validated = ReviewTaskSchema.parse(req.body);
      const employerId = req.user!.userId;
      const ipAddress = req.ip || req.socket.remoteAddress;

      const task = await TasksService.reviewTask(id!, employerId, validated, ipAddress);

      res.status(200).json({
        success: true,
        data: task,
        message: `Task successfully updated: ${validated.action}`
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tasks/:id/approve (Alias for review APPROVE)
   */
  static async approveTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const employerId = req.user!.userId;
      const ipAddress = req.ip || req.socket.remoteAddress;

      const task = await TasksService.reviewTask(
        id!,
        employerId,
        { action: TaskReviewAction.APPROVE, notes },
        ipAddress
      );

      res.status(200).json({
        success: true,
        data: task,
        message: 'Task successfully APPROVED'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tasks/:id/request-revision (Alias for review REQUEST_REVISION)
   */
  static async requestRevision(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { feedback, failedCriteriaIds, failedTestIds } = req.body;
      const employerId = req.user!.userId;
      const ipAddress = req.ip || req.socket.remoteAddress;

      const task = await TasksService.reviewTask(
        id!,
        employerId,
        { action: TaskReviewAction.REQUEST_REVISION, feedback, failedCriteriaIds, failedTestIds },
        ipAddress
      );

      res.status(200).json({
        success: true,
        data: task,
        message: 'Revision successfully requested'
      });
    } catch (err) {
      next(err);
    }
  }
}