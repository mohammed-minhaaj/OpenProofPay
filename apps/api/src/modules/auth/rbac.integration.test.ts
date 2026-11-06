import { describe, it, expect } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole, requireResourceOwnership } from './auth.middleware.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import { UserRole } from '@openproofpay/shared';
import { env } from '../../config/env.js';

function createRBACTestApp() {
  const app = express();
  app.use(express.json());

  // Test endpoint 1: Employer only
  app.get('/employer-only', requireAuth, requireRole([UserRole.EMPLOYER]), (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Welcome Employer' });
  });

  // Test endpoint 2: Developer only
  app.get('/developer-only', requireAuth, requireRole([UserRole.DEVELOPER]), (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Welcome Developer' });
  });

  // Test endpoint 3: Resource Ownership (Anti-IDOR)
  app.patch(
    '/projects/:id',
    requireAuth,
    requireResourceOwnership(async (req) => {
      // Dummy resource lookup: resource with ID "proj-123" is owned by "user-alice"
      if (req.params.id === 'proj-123') return 'user-alice';
      return null;
    }),
    (_req: Request, res: Response) => {
      res.status(200).json({ success: true, message: 'Resource updated' });
    }
  );

  app.use(errorHandler);
  return app;
}

describe('RBAC & Anti-IDOR Middleware Tests', () => {
  const app = createRBACTestApp();

  const employerToken = jwt.sign(
    { userId: 'user-alice', role: UserRole.EMPLOYER, email: 'alice@employer.com' },
    env.JWT_ACCESS_SECRET
  );

  const developerToken = jwt.sign(
    { userId: 'user-bob', role: UserRole.DEVELOPER, email: 'bob@dev.com' },
    env.JWT_ACCESS_SECRET
  );

  const adminToken = jwt.sign(
    { userId: 'user-admin', role: UserRole.ADMIN, email: 'admin@system.com' },
    env.JWT_ACCESS_SECRET
  );

  it('allows EMPLOYER to access employer-only endpoint', async () => {
    const res = await request(app)
      .get('/employer-only')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('blocks DEVELOPER from accessing employer-only endpoint (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/employer-only')
      .set('Authorization', `Bearer ${developerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('allows DEVELOPER to access developer-only endpoint', async () => {
    const res = await request(app)
      .get('/developer-only')
      .set('Authorization', `Bearer ${developerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Anti-IDOR: allows the resource owner (Alice) to modify her project', async () => {
    const res = await request(app)
      .patch('/projects/proj-123')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ name: 'New Title' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Anti-IDOR: blocks a different user (Bob) from modifying Alice project (403 Forbidden)', async () => {
    const res = await request(app)
      .patch('/projects/proj-123')
      .set('Authorization', `Bearer ${developerToken}`)
      .send({ name: 'Hacked Title' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Access denied');
  });

  it('Anti-IDOR: ADMIN can modify any resource regardless of owner', async () => {
    const res = await request(app)
      .patch('/projects/proj-123')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Admin Override' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
