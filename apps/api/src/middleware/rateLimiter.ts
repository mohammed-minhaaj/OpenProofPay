import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 200, // No effective limit in development
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev, // Skip rate limiting entirely in development
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again after 15 minutes'
    }
  }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again after 15 minutes'
    }
  }
});

export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  message: {
    success: false,
    error: {
      code: 'PAYMENT_RATE_LIMIT_EXCEEDED',
      message: 'Too many payment requests, please try again later'
    }
  }
});

export const webhookLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: isDev ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  message: {
    success: false,
    error: {
      code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
      message: 'Webhook rate limit exceeded'
    }
  }
});
