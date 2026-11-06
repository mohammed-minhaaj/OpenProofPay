import { Request, Response, NextFunction } from 'express';
import { RegisterUserSchema, LoginUserSchema, UserRole } from '@openproofpay/shared';
import { AuthService } from './auth.service.js';
import { AppError } from '../../errors/AppError.js';
import { env } from '../../config/env.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = RegisterUserSchema.parse(req.body);
      const result = await AuthService.register(validated, req.ip);

      res.cookie('refreshToken', result.tokens.refreshToken, COOKIE_OPTIONS);

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = LoginUserSchema.parse(req.body);
      const result = await AuthService.login(validated, req.ip);

      res.cookie('refreshToken', result.tokens.refreshToken, COOKIE_OPTIONS);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies.refreshToken || req.body.refreshToken;
      if (!token) {
        throw AppError.unauthorized('Refresh token is required');
      }

      const tokens = await AuthService.refreshToken(token);

      res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);

      res.status(200).json({
        success: true,
        data: { tokens }
      });
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user) {
        await AuthService.logout(req.user.userId);
      }

      res.clearCookie('refreshToken', COOKIE_OPTIONS);
      res.clearCookie('accessToken');

      res.status(200).json({
        success: true,
        message: 'Successfully logged out'
      });
    } catch (err) {
      next(err);
    }
  }

  static async switchRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }
      const { role } = req.body;
      if (!role || !Object.values(UserRole).includes(role)) {
        throw AppError.badRequest('Valid role is required (EMPLOYER, DEVELOPER, ADMIN)');
      }
      const result = await AuthService.switchRole(req.user.userId, role);
      res.status(200).json({
        success: true,
        data: result,
        message: `Role switched to ${role}`
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }

      const user = await AuthService.getMe(req.user.userId);

      res.status(200).json({
        success: true,
        data: {
          user,
          capabilities: {
            canCreateMilestones: req.user.role === 'EMPLOYER' || req.user.role === 'ADMIN',
            canSubmitWork: req.user.role === 'DEVELOPER' || req.user.role === 'ADMIN',
            canApprovePayments: req.user.role === 'EMPLOYER' || req.user.role === 'ADMIN'
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }
}
