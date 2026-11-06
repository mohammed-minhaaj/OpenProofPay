import { Request, Response, NextFunction } from 'express';
import { DisputesService } from './disputes.service.js';
import { AppError } from '../../errors/AppError.js';

export class DisputesController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const { taskId } = req.params;
      if (!taskId) {
        throw AppError.badRequest('Task ID is required');
      }
      const { reason, evidenceSummary, attachments } = req.body;

      if (!reason || !reason.trim()) {
        throw AppError.badRequest('Dispute reason is required');
      }

      const dispute = await DisputesService.createDispute(
        taskId,
        req.user.userId,
        req.user.role,
        { reason, evidenceSummary, attachments },
        req.ip,
        req.headers['user-agent']
      );

      res.status(201).json({
        success: true,
        data: dispute,
        message: 'Dispute submitted for review'
      });
    } catch (error) {
      next(error);
    }
  }

  static async addMessage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const { disputeId } = req.params;
      if (!disputeId) {
        throw AppError.badRequest('Dispute ID is required');
      }
      const { message, attachments } = req.body;

      if (!message || !message.trim()) {
        throw AppError.badRequest('Message content is required');
      }

      const dispute = await DisputesService.addMessage(
        disputeId,
        req.user.userId,
        req.user.role,
        { message, attachments },
        req.ip,
        req.headers['user-agent']
      );

      res.status(200).json({
        success: true,
        data: dispute,
        message: 'Message added to dispute'
      });
    } catch (error) {
      next(error);
    }
  }

  static async resolve(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const { disputeId } = req.params;
      if (!disputeId) {
        throw AppError.badRequest('Dispute ID is required');
      }
      const { verdict, explanation, processRefund } = req.body;

      if (!verdict || !explanation) {
        throw AppError.badRequest('Verdict and explanation are required to resolve a dispute');
      }

      const dispute = await DisputesService.resolveDispute(
        disputeId,
        req.user.userId,
        req.user.role,
        { verdict, explanation, processRefund },
        req.ip,
        req.headers['user-agent']
      );

      res.status(200).json({
        success: true,
        data: dispute,
        message: `Dispute officially resolved as ${verdict}`
      });
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const disputes = await DisputesService.listUserDisputes(req.user.userId, req.user.role);
      res.status(200).json({
        success: true,
        data: disputes
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const { disputeId } = req.params;
      if (!disputeId) {
        throw AppError.badRequest('Dispute ID is required');
      }

      const dispute = await DisputesService.getDisputeById(
        disputeId,
        req.user.userId,
        req.user.role
      );

      res.status(200).json({
        success: true,
        data: dispute
      });
    } catch (error) {
      next(error);
    }
  }
}
