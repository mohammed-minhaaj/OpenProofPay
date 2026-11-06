import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from './analytics.service.js';
import { AppError } from '../../errors/AppError.js';

export class AnalyticsController {
  static async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const userId = req.user.userId;
      const userRole = req.user.role;

      const data = await AnalyticsService.getOverview(userId, userRole);

      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }
}
