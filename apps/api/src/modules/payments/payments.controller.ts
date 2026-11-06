import { Request, Response, NextFunction } from 'express';
import { PaymentsService } from './payments.service.js';

export class PaymentsController {
  /**
   * POST /api/payments/tasks/:taskId/create-order
   * Create PayPal Order v2 using server-validated task amount & currency
   */
  static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { taskId } = req.params;
      const { intent, returnUrl, cancelUrl } = req.body || {};
      const employerId = req.user!.userId;

      const { payment, order } = await PaymentsService.createTaskOrder(
        {
          taskId: taskId!,
          intent,
          returnUrl,
          cancelUrl
        },
        employerId
      );

      res.status(201).json({
        success: true,
        data: {
          payment,
          order
        },
        message: 'PayPal Order v2 created successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/orders/:orderId/authorize
   * Record authorization after employer checkout approval
   */
  static async authorizeOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = req.params;
      const actorId = req.user!.userId;
      const simulate = req.body?.simulate === true || req.query?.simulate === 'true';

      const payment = await PaymentsService.recordAuthorization(orderId!, actorId, simulate);

      res.status(200).json({
        success: true,
        data: payment,
        message: 'Payment authorized and escrow hold active'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/tasks/:taskId/release
   * Execute human employer Proof-to-Pay release gate
   */
  static async releasePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { taskId } = req.params;
      const employerId = req.user!.userId;
      const actorRole = req.user!.role;

      const payment = await PaymentsService.releasePayment(
        taskId!,
        employerId,
        actorRole,
        req.ip
      );

      res.status(200).json({
        success: true,
        data: payment,
        message: 'Payment released and captured via PayPal successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/tasks/:taskId/retry-payout
   * Retry failed or pending developer payout after successful capture
   */
  static async retryPayout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { taskId } = req.params;
      const employerId = req.user!.userId;

      const payment = await PaymentsService.retryPayout(taskId!, employerId, req.ip);

      res.status(200).json({
        success: true,
        data: payment,
        message: 'Developer payout retried successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/orders/:orderId/cancel
   * Cancel an unauthorized order
   */
  static async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = req.params;
      const actorId = req.user!.userId;

      const payment = await PaymentsService.cancelOrder(orderId!, actorId);

      res.status(200).json({
        success: true,
        data: payment,
        message: 'Order cancelled successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/payments/tasks/:taskId
   * Get payment details and event history for a milestone task
   */
  static async getTaskPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { taskId } = req.params;
      const userId = req.user!.userId;

      const details = await PaymentsService.getPaymentDetails(taskId!, userId);

      res.status(200).json({
        success: true,
        data: details
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/payments/history
   * Get user's payment transaction history
   */
  static async getPaymentHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const history = await PaymentsService.getPaymentHistory(userId);

      res.status(200).json({
        success: true,
        data: history
      });
    } catch (err) {
      next(err);
    }
  }
}
