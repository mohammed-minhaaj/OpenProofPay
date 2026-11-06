import { Request, Response, NextFunction } from 'express';
import { ProjectsService } from './projects.service.js';

export class ProjectsController {
  /**
   * POST /api/projects
   * Create a new project workspace
   */
  static async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.userId;
      const ipAddress = req.ip || req.socket.remoteAddress;

      const project = await ProjectsService.createProject(ownerId, req.body, ipAddress);

      res.status(201).json({
        success: true,
        data: project,
        message: 'Project workspace created successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/projects
   * List accessible projects
   */
  static async listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentUserId = req.user!.userId;
      const currentUserRole = req.user!.role;

      const projects = await ProjectsService.listProjects(currentUserId, currentUserRole);

      res.status(200).json({
        success: true,
        data: projects
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/projects/:id
   * Get project with tasks
   */
  static async getProjectById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await ProjectsService.getProjectById(id!);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}