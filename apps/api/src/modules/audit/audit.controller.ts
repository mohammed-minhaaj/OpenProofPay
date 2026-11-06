import { Request, Response, NextFunction } from 'express';
import { AuditLogModel } from '../../models/AuditLog.js';
import { TaskModel } from '../../models/Task.js';
import { ProjectModel } from '../../models/Project.js';
import { UserRole } from '@openproofpay/shared';
import { AppError } from '../../errors/AppError.js';
import mongoose from 'mongoose';

export class AuditController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const { role, userId } = req.user;
      const { resourceType, resourceId, action, page = '1', limit = '50' } = req.query;

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const query: any = {};

      if (resourceType) query.resourceType = resourceType;
      if (resourceId) query.resourceId = resourceId;
      if (action) query.action = action;

      // Anti-IDOR Scope: Non-admins can only see their own actions or resources they own/are assigned to
      if (role !== UserRole.ADMIN) {
        const userObjId = new mongoose.Types.ObjectId(userId);

        if (role === UserRole.EMPLOYER) {
          // Find employer's tasks and projects
          const [projects, tasks] = await Promise.all([
            ProjectModel.find({ ownerId: userObjId }).select('_id'),
            TaskModel.find({ employerId: userObjId }).select('_id')
          ]);

          const accessibleResourceIds = [
            ...projects.map((p) => p._id.toString()),
            ...tasks.map((t) => t._id.toString()),
            userId
          ];

          query.$or = [
            { actorId: userObjId },
            { resourceId: { $in: accessibleResourceIds } }
          ];
        } else if (role === UserRole.DEVELOPER) {
          // Find developer's assigned tasks
          const tasks = await TaskModel.find({ assignedDeveloperId: userObjId }).select('_id');
          const accessibleResourceIds = [...tasks.map((t) => t._id.toString()), userId];

          query.$or = [
            { actorId: userObjId },
            { resourceId: { $in: accessibleResourceIds } }
          ];
        }
      }

      const [logs, total] = await Promise.all([
        AuditLogModel.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        AuditLogModel.countDocuments(query)
      ]);

      res.status(200).json({
        success: true,
        data: logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }
}
