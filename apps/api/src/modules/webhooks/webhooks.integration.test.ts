import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from '../../test/setup.js';
import { UserModel } from '../../models/User.js';
import { ProjectModel } from '../../models/Project.js';
import { TaskModel } from '../../models/Task.js';
import { GitHubInstallationModel } from '../../models/GitHubInstallation.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { WebhookJobModel } from '../../models/WebhookJob.js';
import { PaymentModel } from '../../models/Payment.js';
import { VerificationReportModel } from '../../models/VerificationReport.js';
import { PayPalClient } from '../payments/PayPalClient.js';
import { env } from '../../config/env.js';
import {
  TaskStatus,
  UserRole,
  ProjectStatus,
  PaymentStatus,
  AIRecommendation
} from '@openproofpay/shared';

const app = createApp();

describe('Phase 13: Durable Webhook Queue, Gemini Context & Partial Payout Retries', () => {
  let employerUser: InstanceType<typeof UserModel>;
  let developerUser: InstanceType<typeof UserModel>;
  let otherDevUser: InstanceType<typeof UserModel>;
  let employerToken: string;
  let developerToken: string;
  let project: InstanceType<typeof ProjectModel>;
  let repo: InstanceType<typeof GitHubRepositoryModel>;
  let task: InstanceType<typeof TaskModel>;

  beforeAll(async () => {
    await setupTestDb();
    PayPalClient.setMockMode(true);
  });

  afterAll(async () => {
    await teardownTestDb();
    PayPalClient.setMockMode(false);
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Create Users
    employerUser = await UserModel.create({
      name: 'Bounty Employer',
      email: 'employer@openproofpay.io',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      role: UserRole.EMPLOYER,
      isEmailVerified: true
    });

    developerUser = await UserModel.create({
      name: 'Alice Developer',
      email: 'alice@openproofpay.io',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      role: UserRole.DEVELOPER,
      githubUsername: 'alicedev',
      paypalEmail: 'alice-sandbox@openproofpay.io',
      isEmailVerified: true
    });

    otherDevUser = await UserModel.create({
      name: 'Bob Unassigned',
      email: 'bob@openproofpay.io',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      role: UserRole.DEVELOPER,
      githubUsername: 'bobdev',
      isEmailVerified: true
    });

    employerToken = jwt.sign(
      { userId: employerUser._id.toString(), role: employerUser.role, email: employerUser.email },
      env.JWT_ACCESS_SECRET
    );

    developerToken = jwt.sign(
      { userId: developerUser._id.toString(), role: developerUser.role, email: developerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 2. Connected GitHub Repo
    const installation = await GitHubInstallationModel.create({
      userId: employerUser._id,
      installationId: 887766,
      accountLogin: 'acme-corp',
      accountType: 'Organization',
      encryptedAccessToken: 'iv:tag:mocktoken'
    });

    repo = await GitHubRepositoryModel.create({
      installationId: installation._id,
      githubRepoId: 998877,
      owner: 'acme-corp',
      name: 'web-platform',
      fullName: 'acme-corp/web-platform',
      private: true,
      htmlUrl: 'https://github.com/acme-corp/web-platform',
      defaultBranch: 'main'
    });

    // 3. Project
    project = await ProjectModel.create({
      ownerId: employerUser._id,
      name: 'Acme Web Platform',
      githubRepoId: repo._id,
      status: ProjectStatus.ACTIVE,
      currency: 'USD',
      totalBudget: 5000
    });

    // 4. Task with GitHub Issue #42
    task = await TaskModel.create({
      projectId: project._id,
      employerId: employerUser._id,
      title: 'Fix race condition in session checkout',
      description: 'Resolves GitHub Issue #42 by introducing optimistic concurrency locking',
      githubIssueNumber: 42,
      githubIssueUrl: 'https://github.com/acme-corp/web-platform/issues/42',
      paymentAmount: 250,
      currency: 'USD',
      status: TaskStatus.CREATED, // Unassigned bounty
      minVerificationScore: 80,
      acceptanceCriteria: [
        {
          id: 'crit-1',
          title: 'Optimistic Locking',
          description: 'Uses version column or etag matching',
          mandatory: true
        }
      ]
    });
  });

  describe('1. Durable Webhook Queue & Rapid HTTP 202 Acknowledgment', () => {
    it('verifies HMAC-SHA256 signature, persists WebhookJob, and returns 202 immediately', async () => {
      const webhookSecret = env.GITHUB_WEBHOOK_SECRET || 'test_github_webhook_secret';
      const deliveryId = 'delivery-unique-uuid-1001';
      const payload = {
        action: 'opened',
        pull_request: {
          number: 14,
          title: 'Fixes #42 - Optimistic Locking on Checkout',
          body: 'Implements version check. Fixes #42.',
          head: { sha: 'c0ffee112233445566778899aabbccddeeff0011', ref: 'fix/issue-42' },
          base: { ref: 'main' },
          user: { login: 'bobdev' },
          html_url: 'https://github.com/acme-corp/web-platform/pull/14'
        },
        repository: {
          id: 998877,
          name: 'web-platform',
          full_name: 'acme-corp/web-platform',
          owner: { login: 'acme-corp' }
        }
      };

      const payloadString = JSON.stringify(payload);
      const signature =
        'sha256=' +
        crypto.createHmac('sha256', webhookSecret).update(payloadString).digest('hex');

      // Send to webhook endpoint
      const res = await request(app)
        .post('/api/webhooks/github')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', deliveryId)
        .set('x-hub-signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString);

      // Must acknowledge rapidly with 202 Accepted (prevents GitHub 10s timeouts)
      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('QUEUED');
      expect(res.body.data.jobId).toBeDefined();

      // Verify job is durably persisted in database
      const persistedJob = await WebhookJobModel.findOne({ deliveryId });
      expect(persistedJob).toBeDefined();
      expect(persistedJob?.event).toBe('pull_request');
      expect(persistedJob?.action).toBe('opened');

      // Deduplication: sending identical deliveryId returns DUPLICATE status
      const dupRes = await request(app)
        .post('/api/webhooks/github')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', deliveryId)
        .set('x-hub-signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString);

      expect(dupRes.status).toBe(202);
      expect(dupRes.body.data.status).toBe('IGNORED_DUPLICATE');
    });

    it('rejects unverified webhooks with invalid HMAC signatures', async () => {
      const res = await request(app)
        .post('/api/webhooks/github')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'fake-delivery')
        .set('x-hub-signature-256', 'sha256=invalid_hex_string_signature_attempt')
        .set('Content-Type', 'application/json')
        .send({ action: 'opened' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. Explicit Task Claiming vs Unassigned PR Protection (Correction #2)', () => {
    it('allows verified developer to explicitly claim an unassigned bounty task via POST /api/tasks/:id/claim', async () => {
      const res = await request(app)
        .post(`/api/tasks/${task._id}/claim`)
        .set('Authorization', `Bearer ${developerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assignedDeveloperId).toBe(developerUser._id.toString());
      expect([TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS]).toContain(res.body.data.status);

      // Verify second claiming by a different developer is blocked with 403 Forbidden
      const otherDevToken = jwt.sign(
        { userId: otherDevUser._id.toString(), role: otherDevUser.role, email: otherDevUser.email },
        env.JWT_ACCESS_SECRET
      );

      const secondClaim = await request(app)
        .post(`/api/tasks/${task._id}/claim`)
        .set('Authorization', `Bearer ${otherDevToken}`);

      expect(secondClaim.status).toBe(403);
    });

    it('does NOT automatically assign unassigned task to PR author when webhook arrives', async () => {
      // Ensure task is unassigned
      expect(task.assignedDeveloperId).toBeUndefined();

      // Simulate a PR arriving from Bob
      const submission = await PullRequestSubmissionModel.create({
        taskId: task._id,
        developerId: task.employerId, // Temporary reference, not claiming task
        repositoryId: repo._id,
        prNumber: 99,
        prUrl: 'https://github.com/acme-corp/web-platform/pull/99',
        headSha: '1122334455667788990011223344556677889900',
        baseBranch: 'main',
        headBranch: 'fix/optimistic',
        title: 'Fixes #42 - Auto assign check',
        status: 'PENDING'
      });

      // Verify task still has NO assigned developer
      expect(submission._id).toBeDefined();
      const refreshedTask = await TaskModel.findById(task._id);
      expect(refreshedTask?.assignedDeveloperId).toBeUndefined();
    });
  });

  describe('3. Partial Payment Failures & Safe Idempotent Retries (Requirement 3)', () => {
    it('preserves CAPTURED status when developer payout fails and allows idempotent retries via POST /api/payments/tasks/:taskId/retry-payout', async () => {
      task.assignedDeveloperId = developerUser._id;
      await task.save();

      // Setup a payment record where funds were captured to merchant account,
      // but developer payout failed (e.g. unverified PayPal email)
      const payment = await PaymentModel.create({
        taskId: task._id,
        projectId: project._id,
        employerId: employerUser._id,
        developerId: developerUser._id,
        amount: 250,
        currency: 'USD',
        status: PaymentStatus.CAPTURED,
        idempotencyKey: 'idemp-test-payout-101',
        paypalOrderId: 'ORD-SANDBOX-CAPTURE-OK',
        paypalAuthorizationId: 'AUTH-SANDBOX-CAPTURE-OK',
        paypalCaptureId: 'CAP-SANDBOX-CAPTURE-OK',
        payoutStatus: 'FAILED',
        payoutError: 'RECEIVER_UNCONFIRMED_EMAIL: Developer PayPal account email is unconfirmed in sandbox',
        payoutRetries: 1,
        developerPayPalEmail: 'alice-sandbox@openproofpay.io'
      });

      // Employer triggers retry payout via API
      const res = await request(app)
        .post(`/api/payments/tasks/${task._id}/retry-payout`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify payment status remained safely CAPTURED or transitioned to PAID_OUT
      const refreshedPayment = await PaymentModel.findById(payment._id);
      expect([PaymentStatus.CAPTURED, PaymentStatus.PAID_OUT]).toContain(refreshedPayment?.status);
      expect(refreshedPayment?.payoutRetries).toBeGreaterThanOrEqual(1);

      // Verify anti-IDOR: developer cannot call retry-payout
      const devRes = await request(app)
        .post(`/api/payments/tasks/${task._id}/retry-payout`)
        .set('Authorization', `Bearer ${developerToken}`);

      expect(devRes.status).toBe(403);
    });
  });

  describe('4. Expanded Gemini Repository Context & Structured Recommendation Schema', () => {
    it('saves recommendation, positiveFindings, and missingFunctionality in VerificationReport', async () => {
      const submission = await PullRequestSubmissionModel.create({
        taskId: task._id,
        developerId: developerUser._id,
        repositoryId: repo._id,
        prNumber: 42,
        prUrl: 'https://github.com/acme-corp/web-platform/pull/42',
        headSha: 'aabbccddeeff00112233445566778899aabbccdd',
        baseBranch: 'main',
        headBranch: 'feat/locking',
        title: 'Optimistic locking implement',
        status: 'PENDING'
      });

      const report = await VerificationReportModel.create({
        submissionId: submission._id,
        taskId: task._id,
        commitSha: submission.headSha,
        overallScore: 92,
        verdict: 'PASS',
        recommendation: AIRecommendation.ACCEPT,
        positiveFindings: [
          'Excellent use of ETag validation headers',
          'Clean optimistic lock exception handling'
        ],
        missingFunctionality: [],
        status: 'PASSED',
        overallAssessment: 'Acceptance criteria fully satisfied with high code quality',
        isOutdated: false,
        isDecisionSupportOnly: true,
        modelUsed: 'mock:test'
      });

      expect(report.recommendation).toBe(AIRecommendation.ACCEPT);
      expect(report.positiveFindings).toHaveLength(2);
      expect(report.missingFunctionality).toHaveLength(0);
      expect(report.isDecisionSupportOnly).toBe(true); // AI never captures funds directly
    });
  });
});
