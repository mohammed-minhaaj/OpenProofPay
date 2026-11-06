import { Request, Response, NextFunction } from 'express';
import { NotificationService } from './notifications.service.js';
import { AppError } from '../../errors/AppError.js';

export class NotificationController {
  /**
   * GET /api/notifications/stream
   * Real-time Server-Sent Events stream
   */
  static stream(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required for real-time notifications stream');
      }

      // Set standard SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      NotificationService.registerSubscriber(req.user.userId, res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/notifications
   * List paginated notifications for current user
   */
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const { page, limit, unreadOnly } = req.query;
      const data = await NotificationService.listUserNotifications(req.user.userId, {
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        unreadOnly: unreadOnly === 'true'
      });

      res.status(200).json({
        success: true,
        data: data.notifications,
        unreadCount: data.unreadCount,
        pagination: data.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/notifications/:id/read
   * Mark single notification as read
   */
  static async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const { id } = req.params;
      if (!id) {
        throw AppError.badRequest('Notification ID is required');
      }

      const notification = await NotificationService.markAsRead(id, req.user.userId);
      res.status(200).json({
        success: true,
        data: notification
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/notifications/read-all
   * Mark all notifications as read
   */
  static async markAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const count = await NotificationService.markAllAsRead(req.user.userId);
      res.status(200).json({
        success: true,
        data: { modifiedCount: count },
        message: 'All notifications marked as read'
      });
    } catch (error) {
      next(error);
    }
  }
}
