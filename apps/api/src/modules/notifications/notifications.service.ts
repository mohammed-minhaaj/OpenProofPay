import { Response } from 'express';
import mongoose from 'mongoose';
import { NotificationModel, INotificationDocument } from '../../models/Notification.js';
import { NotificationType } from '@openproofpay/shared';
import { AppError } from '../../errors/AppError.js';

export interface SendNotificationInput {
  recipientId: string | mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  resourceType: 'Task' | 'Payment' | 'VerificationReport' | 'Dispute';
  resourceId: string | mongoose.Types.ObjectId;
}

export class NotificationService {
  // In-memory active Server-Sent Events subscriber connections by userId
  private static subscribers: Map<string, Set<Response>> = new Map();

  /**
   * Register a new client for real-time Server-Sent Events stream
   */
  static registerSubscriber(userId: string, res: Response): void {
    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, new Set());
    }
    const userClients = this.subscribers.get(userId)!;
    userClients.add(res);

    // Initial SSE connected handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    // Keep-alive heartbeat comment every 25s to prevent timeouts
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    // Clean up when client disconnects
    res.on('close', () => {
      clearInterval(heartbeat);
      userClients.delete(res);
      if (userClients.size === 0) {
        this.subscribers.delete(userId);
      }
    });
  }

  /**
   * Create notification in database and broadcast live to connected SSE clients
   */
  static async sendNotification(input: SendNotificationInput): Promise<INotificationDocument> {
    const recipientObjectId =
      typeof input.recipientId === 'string'
        ? new mongoose.Types.ObjectId(input.recipientId)
        : input.recipientId;

    const resourceObjectId =
      typeof input.resourceId === 'string'
        ? new mongoose.Types.ObjectId(input.resourceId)
        : input.resourceId;

    const notification = await NotificationModel.create({
      recipientId: recipientObjectId,
      type: input.type,
      title: input.title,
      message: input.message,
      resourceType: input.resourceType,
      resourceId: resourceObjectId,
      read: false
    });

    // Broadcast in real-time to active SSE clients
    const userIdStr = recipientObjectId.toString();
    const activeClients = this.subscribers.get(userIdStr);
    if (activeClients && activeClients.size > 0) {
      const payload = JSON.stringify(notification.toJSON());
      activeClients.forEach((client) => {
        try {
          client.write(`event: notification\ndata: ${payload}\n\n`);
        } catch (err) {
          console.error(`Failed to push notification SSE to client for user ${userIdStr}:`, err);
        }
      });
    }

    return notification;
  }

  /**
   * List paginated notifications for user
   */
  static async listUserNotifications(
    userId: string,
    options: { page?: number; limit?: number; unreadOnly?: boolean } = {}
  ) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const query: any = { recipientId: new mongoose.Types.ObjectId(userId) };
    if (options.unreadOnly) {
      query.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      NotificationModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      NotificationModel.countDocuments(query),
      NotificationModel.countDocuments({ recipientId: new mongoose.Types.ObjectId(userId), read: false })
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Mark single notification as read (with Anti-IDOR check)
   */
  static async markAsRead(notificationId: string, userId: string): Promise<INotificationDocument> {
    const notification = await NotificationModel.findById(notificationId);
    if (!notification) {
      throw AppError.notFound(`Notification '${notificationId}' not found`);
    }

    if (notification.recipientId.toString() !== userId) {
      throw AppError.forbidden('Cannot mark another user\'s notification as read', 'FORBIDDEN_NOTIFICATION');
    }

    notification.read = true;
    await notification.save();
    return notification;
  }

  /**
   * Mark all notifications as read for user
   */
  static async markAllAsRead(userId: string): Promise<number> {
    const result = await NotificationModel.updateMany(
      { recipientId: new mongoose.Types.ObjectId(userId), read: false },
      { $set: { read: true } }
    );
    return result.modifiedCount;
  }
}
