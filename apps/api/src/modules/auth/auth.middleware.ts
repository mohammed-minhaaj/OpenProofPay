import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@openproofpay/shared';
import { AppError } from '../../errors/AppError.js';
import { env } from '../../config/env.js';
import { TokenPayload } from './auth.service.js';

// Extend Express Request interface with typed user property
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Authentication middleware verifying Access Token (JWT)
 */
export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return next(AppError.unauthorized('Authentication required: Missing access token'));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(AppError.unauthorized('Token expired', 'TOKEN_EXPIRED'));
    }
    return next(AppError.unauthorized('Invalid authentication token', 'INVALID_TOKEN'));
  }
};

/**
 * Role-Based Access Control (RBAC) middleware
 */
export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Access forbidden: Requires one of [${allowedRoles.join(', ')}] roles`
        )
      );
    }

    next();
  };
};

/**
 * Anti-IDOR resource ownership guard helper
 */
export const requireResourceOwnership = (
  getResourceOwnerId: (req: Request) => Promise<string | null | undefined>
) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized('Authentication required'));
      }

      // Admins bypass IDOR ownership check
      if (req.user.role === UserRole.ADMIN) {
        return next();
      }

      const ownerId = await getResourceOwnerId(req);
      if (!ownerId) {
        return next(AppError.notFound('Target resource not found'));
      }

      if (ownerId !== req.user.userId) {
        return next(
          AppError.forbidden(
            'Access denied: You do not have permission to modify or access this resource'
          )
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
