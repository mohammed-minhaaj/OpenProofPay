import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from '../../test/setup.js';
import { UserModel } from '../../models/User.js';
import { ProjectModel } from '../../models/Project.js';
import { TaskModel } from '../../models/Task.js';
import { GitHubInstallationModel } from '../../models/GitHubInstallation.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { VerificationReportModel } from '../../models/VerificationReport.js';
import { WebhookJobModel } from '../../models/WebhookJob.js';
import {
  generateSignedOAuthState,
  verifySignedOAuthState,
  encryptSecret,
  decryptSecret
} from '../../utils/crypto.js';
import { TaskStatus, UserRole, ProjectStatus, SubmissionStatus } from '@openproofpay/shared';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const app = createApp();

describe('Phase 4: GitHub Integration & Security Tests', () => {
  let employerUser: InstanceType<typeof UserModel>;
  let developerUser: InstanceType<typeof UserModel>;
  let employerToken: string;
  let developerToken: string;
  let project: InstanceType<typeof ProjectModel>;
  let repo: InstanceType<typeof GitHubRepositoryModel>;
  let task: InstanceType<typeof TaskModel>;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Create Employer
    employerUser = await UserModel.create({
      email: 'employer@github-test.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Alice Employer',
      role: UserRole.EMPLOYER,
      githubConnected: true,
      githubUsername: 'alice-employer'
    });

    employerToken = jwt.sign(
      { userId: employerUser._id.toString(), role: UserRole.EMPLOYER, email: employerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 2. Create Developer
    developerUser = await UserModel.create({
      email: 'dev@github-test.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Bob Developer',
      role: UserRole.DEVELOPER,
      githubConnected: true,
      githubUsername: 'bob-developer'
    });

    developerToken = jwt.sign(
      { userId: developerUser._id.toString(), role: UserRole.DEVELOPER, email: developerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 3. Create Installation
    const installation = await GitHubInstallationModel.create({
      userId: employerUser._id,
      installationId: 889900,
      accountLogin: 'alice-employer',
      accountType: 'User',
      targetId: 889900,
      encryptedAccessToken: encryptSecret(['gh' + 'p', 'dummy_token_1234567890'].join('_'))
    });

    // 4. Create Project & Linked Repository
    repo = await GitHubRepositoryModel.create({
      installationId: installation._id,
      githubRepoId: 101020,
      fullName: 'openproofpay/core-engine',
      owner: 'openproofpay',
      name: 'core-engine',
      private: false,
      htmlUrl: 'https://github.com/openproofpay/core-engine'
    });

    project = await ProjectModel.create({
      ownerId: employerUser._id,
      name: 'OpenProofPay Platform',
      githubRepoId: repo._id,
      status: ProjectStatus.ACTIVE,
      currency: 'USD'
    });

    // 5. Create Task
    task = await TaskModel.create({
      projectId: project._id,
      employerId: employerUser._id,
      assignedDeveloperId: developerUser._id,
      githubIssueNumber: 42,
      githubIssueUrl: 'https://github.com/openproofpay/core-engine/issues/42',
      title: 'Fix HMAC Webhook Validation',
      description: 'Preserve raw request body for timing-safe signature verification',
      paymentAmount: 200,
      currency: 'USD',
      status: TaskStatus.IN_PROGRESS
    });
  });

  describe('1. Cryptographic Token & OAuth State Security', () => {
    it('AES-256-GCM encrypts tokens and decrypts authentically', () => {
      const secret = ['gh' + 'p', 'secret_access_token_super_confidential'].join('_');
      const encrypted = encryptSecret(secret);

      expect(encrypted).not.toBe(secret);
      expect(encrypted.split(':').length).toBe(3); // iv:authTag:ciphertext

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('generates signed CSRF OAuth state and verifies correctly', () => {
      const userId = employerUser._id.toString();
      const state = generateSignedOAuthState(userId);

      const verifiedUserId = verifySignedOAuthState(state);
      expect(verifiedUserId).toBe(userId);
    });

    it('rejects tampered OAuth state tokens', () => {
      const state = generateSignedOAuthState(employerUser._id.toString());
      const tampered = state.substring(0, state.length - 4) + 'abcd';

      expect(() => verifySignedOAuthState(tampered)).toThrow();
    });

    it('GET /api/github/connect returns signed OAuth authorization URL', async () => {
      const res = await request(app)
        .get('/api/github/connect')
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain('https://github.com/login/oauth/authorize');
      expect(res.body.data.state).toBeDefined();

      const extractedUserId = verifySignedOAuthState(res.body.data.state);
      expect(extractedUserId).toBe(employerUser._id.toString());
    });
  });

  describe('2. Verified & Idempotent GitHub Webhooks', () => {
    const webhookSecret = 'test_webhook_secret_key_123';

    it('accepts and verifies valid GitHub webhook with HMAC-SHA256 signature', async () => {
      // Temporarily set webhook secret in env
      const originalSecret = env.GITHUB_WEBHOOK_SECRET;
      (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET = webhookSecret;

      const payload = {
        action: 'edited',
        repository: {
          id: 101020,
          full_name: 'openproofpay/core-engine',
          name: 'core-engine',
          owner: { login: 'openproofpay' }
        },
        issue: {
          number: 42,
          title: 'Updated Issue Title from GitHub',
          body: 'Updated description from GitHub',
          state: 'open'
        }
      };

      const rawBody = JSON.stringify(payload);
      const signature = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      const deliveryId = crypto.randomUUID();

      const res = await request(app)
        .post('/api/webhooks/github')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'issues')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect([200, 202]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(['PROCESSED', 'QUEUED']).toContain(res.body.data.status);

      // Give durable worker a moment to process the queued job
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify Task description was synced from webhook
      const updatedTask = await TaskModel.findById(task._id);
      expect(updatedTask?.title).toBe('Updated Issue Title from GitHub');
      expect(updatedTask?.description).toBe('Updated description from GitHub');

      (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET = originalSecret;
    });

    it('rejects webhooks with invalid HMAC signatures (401 Unauthorized)', async () => {
      const originalSecret = env.GITHUB_WEBHOOK_SECRET;
      (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET = webhookSecret;

      const payload = { action: 'opened' };
      const badSignature = 'sha256=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad';
      const deliveryId = crypto.randomUUID();

      const res = await request(app)
        .post('/api/webhooks/github')
        .set('X-Hub-Signature-256', badSignature)
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'issues')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);

      (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET = originalSecret;
    });

    it('safely ignores duplicate webhook delivery IDs (Idempotency)', async () => {
      const originalSecret = env.GITHUB_WEBHOOK_SECRET;
      (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET = undefined; // Bypass signature for idempotency test

      const deliveryId = 'duplicate-delivery-test-uuid-999';
      const payload = {
        action: 'edited',
        repository: { id: 101020, full_name: 'openproofpay/core-engine', owner: { login: 'openproofpay' }, name: 'core-engine' }
      };

      // First delivery
      const res1 = await request(app)
        .post('/api/webhooks/github')
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'issues')
        .send(payload);

      expect([200, 202]).toContain(res1.status);
      expect(['PROCESSED', 'QUEUED']).toContain(res1.body.data.status);

      // Second delivery with identical X-GitHub-Delivery ID
      const res2 = await request(app)
        .post('/api/webhooks/github')
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'issues')
        .send(payload);

      expect([200, 202]).toContain(res2.status);
      expect(res2.body.data.status).toBe('IGNORED_DUPLICATE');
      expect(res2.body.data.duplicate).toBe(true);

      (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET = originalSecret;
    });

    it('PR synchronize event marks previous VerificationReport as isOutdated: true', async () => {
      const originalSecret = env.GITHUB_WEBHOOK_SECRET;
      (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET = undefined;

      // Create existing submission and verification report
      const submission = await PullRequestSubmissionModel.create({
        taskId: task._id,
        developerId: developerUser._id,
        repositoryId: repo._id,
        prNumber: 55,
        prUrl: 'https://github.com/openproofpay/core-engine/pull/55',
        headSha: 'old_commit_sha_111111',
        baseBranch: 'main',
        headBranch: 'feature/fix',
        title: 'Fix issue',
        status: SubmissionStatus.PENDING,
        additions: 10,
        deletions: 2,
        changedFilesCount: 1
      });

      const report = await VerificationReportModel.create({
        submissionId: submission._id,
        taskId: task._id,
        commitSha: 'old_commit_sha_111111',
        overallScore: 85,
        status: 'PASSED',
        modelUsed: 'gemini-2.5-pro',
        isOutdated: false
      });

      // Send synchronize event with new commit SHA
      const newSha = 'new_commit_sha_222222';
      const deliveryId = crypto.randomUUID();

      const res = await request(app)
        .post('/api/webhooks/github')
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'pull_request')
        .send({
          action: 'synchronize',
          repository: { id: 101020, full_name: 'openproofpay/core-engine', owner: { login: 'openproofpay' }, name: 'core-engine' },
          pull_request: {
            number: 55,
            title: 'Fix issue',
            state: 'open',
            merged: false,
            head: { sha: newSha, ref: 'feature/fix' },
            base: { ref: 'main' }
          }
        });

      expect([200, 202]).toContain(res.status);

      // Give worker a moment to process synchronize event
      await new Promise((resolve) => setTimeout(resolve, 500));
      const job = await WebhookJobModel.findOne({ deliveryId });
      console.log('JOB DEBUG:', job?.status, job?.lastError);

      // Verify old verification report is marked outdated
      const updatedReport = await VerificationReportModel.findById(report._id);
      expect(updatedReport?.isOutdated).toBe(true);

      // Verify submission record updated with new head SHA
      const updatedSubmission = await PullRequestSubmissionModel.findById(submission._id);
      expect(updatedSubmission?.headSha).toBe(newSha);

      (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET = originalSecret;
    });
  });

  describe('3. Untrusted PR Submission Validation (Rule 14 & Section 3)', () => {
    it('rejects PR submission when repository does not match linked project repository', async () => {
      // Submitting PR from an unrelated repo: "hacker-org/other-repo"
      const res = await request(app)
        .post(`/api/tasks/${task._id}/submissions`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          prUrl: 'https://github.com/hacker-org/other-repo/pull/99',
          prNumber: 99
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('REPOSITORY_MISMATCH');
      expect(res.body.error.message).toContain('Repository mismatch');
    });

    it('rejects submission if developer has not connected GitHub account', async () => {
      const unconnectedDev = await UserModel.create({
        email: 'unconnected@test.com',
        passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
        name: 'Unconnected Dev',
        role: UserRole.DEVELOPER,
        githubConnected: false
      });

      const token = jwt.sign(
        { userId: unconnectedDev._id.toString(), role: UserRole.DEVELOPER, email: unconnectedDev.email },
        env.JWT_ACCESS_SECRET
      );

      const res = await request(app)
        .post(`/api/tasks/${task._id}/submissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          prUrl: 'https://github.com/openproofpay/core-engine/pull/42',
          prNumber: 42
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('GITHUB_NOT_CONNECTED');
    });
  });
});
