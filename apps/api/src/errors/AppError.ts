export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown): AppError {
    return new AppError(message, 400, code, details);
  }

  static unauthorized(message = 'Unauthorized access', code = 'UNAUTHORIZED'): AppError {
    return new AppError(message, 401, code);
  }

  static forbidden(message = 'Forbidden action', code = 'FORBIDDEN'): AppError {
    return new AppError(message, 403, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND'): AppError {
    return new AppError(message, 404, code);
  }

  static conflict(message: string, code = 'CONFLICT'): AppError {
    return new AppError(message, 409, code);
  }

  static unprocessable(message: string, code = 'UNPROCESSABLE_ENTITY', details?: unknown): AppError {
    return new AppError(message, 422, code, details);
  }

  static badGateway(message = 'Bad gateway response from external service', code = 'BAD_GATEWAY'): AppError {
    return new AppError(message, 502, code);
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(message, 500, 'INTERNAL_SERVER_ERROR');
  }
}
