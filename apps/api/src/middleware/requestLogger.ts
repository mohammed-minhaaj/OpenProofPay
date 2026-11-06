import { Request, Response, NextFunction } from 'express';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'clientsecret',
  'authorization',
  'cookie',
  'githubtoken',
  'paypalclientsecret'
]);

export function sanitizeObject(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeObject(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const logLevel = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';

    const logEntry = {
      level: logLevel,
      timestamp: new Date().toISOString(),
      method,
      url: originalUrl,
      status: statusCode,
      durationMs: duration,
      ip: ip || req.socket.remoteAddress
    };

    if (statusCode >= 400) {
      console.warn(`[${logEntry.timestamp}] ${logEntry.method} ${logEntry.url} ${logEntry.status} - ${logEntry.durationMs}ms`);
    } else if (process.env.NODE_ENV !== 'test') {
      console.log(`[${logEntry.timestamp}] ${logEntry.method} ${logEntry.url} ${logEntry.status} - ${logEntry.durationMs}ms`);
    }
  });

  next();
};
