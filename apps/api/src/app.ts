import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { standardLimiter } from './middleware/rateLimiter.js';
import authRoutes from './modules/auth/auth.routes.js';
import githubRoutes from './modules/github/github.routes.js';
import submissionRoutes from './modules/submissions/submissions.routes.js';
import webhookRoutes from './modules/webhooks/webhooks.routes.js';
import tasksRoutes from './modules/tasks/tasks.routes.js';
import projectsRoutes from './modules/projects/projects.routes.js';
import aiVerificationRoutes from './modules/ai-verification/ai-verification.routes.js';
import testRunnerRoutes from './modules/test-runner/test-runner.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import disputesRoutes from './modules/disputes/disputes.routes.js';
import { DisputesController } from './modules/disputes/disputes.controller.js';
import { GitHubController } from './modules/github/github.controller.js';
import { requireAuth } from './modules/auth/auth.middleware.js';
import { AppError } from './errors/AppError.js';

export const createApp = (): Express => {
  const app = express();

  // 1. Basic security headers
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );

  // 2. Strict CORS policy supporting Web App origin and Chrome Extension origins
  const allowedOrigins: (string | RegExp)[] = [
    env.CLIENT_ORIGIN,
    env.EXTENSION_ID,
    /^chrome-extension:\/\/[a-z0-9]{32}$/
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        const isAllowed = allowedOrigins.some((allowed) => {
          if (typeof allowed === 'string') {
            return allowed === origin;
          }
          return allowed.test(origin);
        });

        if (isAllowed) {
          callback(null, true);
        } else {
          callback(new AppError(`Origin ${origin} not allowed by CORS`, 403, 'CORS_ERROR'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Requested-With']
    })
  );

  // 3. Body parsers with raw body buffer preservation for HMAC signatures
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // 4. Request logging
  app.use(requestLogger);

  // 5. Global rate limiter for standard endpoints
  app.use(standardLimiter);

  // 6. Root & Health check endpoints
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'OpenProofPay API',
      version: '1.0.0',
      status: 'UP',
      description: 'AI-verified milestone escrow payments via PayPal Sandbox (Proof-to-Pay)',
      health: '/health',
      webDashboard: env.CLIENT_ORIGIN
    });
  });

  app.get(['/health', '/api/health', '/api/v1/health', '/api/v1/system/db-diagnostic'], (_req: Request, res: Response) => {
    const dbState = mongoose.connection.readyState;
    const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.status(200).json({
      success: true,
      data: {
        status: dbState === 1 ? 'UP' : 'DEGRADED',
        timestamp: new Date().toISOString(),
        service: 'OpenProofPay API',
        environment: env.NODE_ENV,
        database: {
          name: mongoose.connection.name || 'openproofpay',
          status: dbStates[dbState] || 'unknown',
          host: mongoose.connection.host || 'localhost'
        }
      }
    });
  });

  // 7. Mount Module Routes (Dual-support for /api and /api/v1)
  app.use('/api/auth', authRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/github', githubRoutes);
  app.use('/api/v1/github', githubRoutes);
  app.use('/api/projects', projectsRoutes);
  app.use('/api/v1/projects', projectsRoutes);
  app.use('/api/tasks', tasksRoutes);
  app.use('/api/v1/tasks', tasksRoutes);
  app.use('/api', submissionRoutes);
  app.use('/api/v1', submissionRoutes);
  app.use('/api', aiVerificationRoutes);
  app.use('/api/v1', aiVerificationRoutes);
  app.use('/api', testRunnerRoutes);
  app.use('/api/v1', testRunnerRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/v1/payments', paymentsRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/v1/notifications', notificationsRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/v1/audit-logs', auditRoutes);
  app.use('/api/disputes', disputesRoutes);
  app.use('/api/v1/disputes', disputesRoutes);
  app.post('/api/tasks/:taskId/disputes', requireAuth, DisputesController.create);
  app.post('/api/v1/tasks/:taskId/disputes', requireAuth, DisputesController.create);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/v1/webhooks', webhookRoutes);

  // Route to bind repository to project
  app.post('/api/projects/:projectId/repo', requireAuth, GitHubController.bindProjectRepo);
  app.post('/api/v1/projects/:projectId/repo', requireAuth, GitHubController.bindProjectRepo);

  // 8. 404 Handler for undefined routes
  app.use((req: Request, _res: Response, next) => {
    next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
  });

  // 9. Centralized Error Handler
  app.use(errorHandler);

  return app;
};
