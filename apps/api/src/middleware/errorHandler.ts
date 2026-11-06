import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';
import { env } from '../config/env.js';

interface FormattedErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
}

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown = undefined;

  // 1. AppError (Custom operational errors)
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  }
  // 2. Zod Validation Errors
  else if (err.name === 'ZodError' || err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    const issues = (err as ZodError).issues || (err as ZodError).errors || [];
    details = issues.map((e) => ({
      path: e.path.join('.'),
      message: e.message
    }));
  }
  // 3. Mongoose Validation Errors
  else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    code = 'DATABASE_VALIDATION_ERROR';
    message = 'Data validation failed';
    details = Object.values(err.errors).map((e) => ({
      path: e.path,
      message: e.message
    }));
  }
  // 4. Mongoose Cast Errors (Invalid ObjectId)
  else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = 'INVALID_IDENTIFIER';
    message = `Invalid ${err.path}: ${String(err.value)}`;
  }
  // 5. MongoDB Duplicate Key (E11000)
  else if ((err as { code?: number }).code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY_ERROR';
    message = 'Resource with this identifier already exists';
    const keyValue = (err as { keyValue?: Record<string, unknown> }).keyValue;
    if (keyValue) {
      details = keyValue;
    }
  }
  // 6. JWT Errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  }

  // Structured sanitized logging for server-side monitoring
  if (statusCode >= 500) {
    console.error(`[CRITICAL ERROR] [${code}] ${err.message}`, {
      stack: env.NODE_ENV !== 'production' ? err.stack : undefined
    });
  } else {
    console.warn(`[CLIENT ERROR] [${statusCode} ${code}] ${message}`);
  }

  const response: FormattedErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(env.NODE_ENV === 'development' && statusCode >= 500 ? { stack: err.stack } : {})
    }
  };

  res.status(statusCode).json(response);
};
