import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from '../../test/setup.js';
import { UserModel } from '../../models/User.js';

const app = createApp();

describe('Auth Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('POST /api/auth/register', () => {
    it('successfully registers an EMPLOYER and returns tokens', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'employer@openproofpay.com',
          password: 'Password123!',
          name: 'Sarah Employer',
          role: 'EMPLOYER'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('employer@openproofpay.com');
      expect(res.body.data.user.role).toBe('EMPLOYER');
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();

      // Verify password is hashed in database and never exposed
      const savedUser = await UserModel.findOne({ email: 'employer@openproofpay.com' }).select('+passwordHash');
      expect(savedUser).toBeDefined();
      expect(savedUser?.passwordHash).not.toBe('Password123!');
      expect(savedUser?.passwordHash.startsWith('$2')).toBe(true);
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('successfully registers a DEVELOPER with GitHub username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'dev@openproofpay.com',
          password: 'Password123!',
          name: 'Alex Developer',
          role: 'DEVELOPER',
          githubUsername: 'alexdev'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('DEVELOPER');
      expect(res.body.data.user.githubUsername).toBe('alexdev');
      expect(res.body.data.user.githubConnected).toBe(true);
    });

    it('rejects registration with duplicate email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@test.com',
          password: 'Password123!',
          name: 'First User',
          role: 'DEVELOPER'
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@test.com',
          password: 'AnotherPassword123!',
          name: 'Second User',
          role: 'EMPLOYER'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('rejects invalid password format (Zod validation)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'weak@test.com',
          password: 'weak',
          name: 'Weak Password User',
          role: 'DEVELOPER'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'login-test@openproofpay.com',
          password: 'CorrectPassword123!',
          name: 'Login Tester',
          role: 'DEVELOPER'
        });
    });

    it('successfully logs in with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login-test@openproofpay.com',
          password: 'CorrectPassword123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('rejects login with incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login-test@openproofpay.com',
          password: 'WrongPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/auth/refresh (Token Rotation)', () => {
    it('successfully rotates refresh token and invalidates old one', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'rotation@test.com',
          password: 'Password123!',
          name: 'Rotation Tester',
          role: 'DEVELOPER'
        });

      const initialRefreshToken = registerRes.body.data.tokens.refreshToken;

      // 1. First refresh with valid token
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      const newRefreshToken = refreshRes.body.data.tokens.refreshToken;
      expect(newRefreshToken).toBeDefined();
      expect(newRefreshToken).not.toBe(initialRefreshToken);

      // 2. Attempting to reuse old refresh token must be rejected (Token Rotation Guard)
      const reusedRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(reusedRes.status).toBe(401);
      expect(reusedRes.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns user profile with authenticated token', async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'me-test@openproofpay.com',
          password: 'Password123!',
          name: 'Me Tester',
          role: 'EMPLOYER'
        });

      const token = registerRes.body.data.tokens.accessToken;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('me-test@openproofpay.com');
      expect(res.body.data.capabilities.canCreateMilestones).toBe(true);
      expect(res.body.data.capabilities.canApprovePayments).toBe(true);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
