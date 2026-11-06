import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from '../../test/setup.js';
import { UserModel } from '../../models/User.js';
import { ProjectModel } from '../../models/Project.js';
import { TaskModel } from '../../models/Task.js';
import { GitHubInstallationModel } from '../../models/GitHubInstallation.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { VerificationReportModel } from '../../models/VerificationReport.js';
import { TestExecutionModel } from '../../models/TestExecution.js';
import { PaymentModel } from '../../models/Payment.js';
import { PaymentEventModel } from '../../models/PaymentEvent.js';
import { PayPalClient } from './PayPalClient.js';
import { env } from '../../config/env.js';
import {
  TaskStatus,
  UserRole,
  ProjectStatus,
  SubmissionStatus,
  PaymentStatus,
  VerificationVerdict
} from '@openproofpay/shared';

const app = createApp();

describe('Phase 8: Real PayPal Sandbox Integration & Proof-to-Pay Gate', () => {
  let employerUser: InstanceType<typeof UserModel>;
  let developerUser: InstanceType<typeof UserModel>;
  let otherEmployerUser: InstanceType<typeof UserModel>;
  let employerToken: string;
  let developerToken: string;
  let otherEmployerToken: string;
  let project: InstanceType<typeof ProjectModel>;
  let repo: InstanceType<typeof GitHubRepositoryModel>;
  let task: InstanceType<typeof TaskModel>;
  let submission: InstanceType<typeof PullRequestSubmissionModel>;

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

    // 1. Create Primary Employer (Alice)
    employerUser = await UserModel.create({
      email: 'alice.employer@paypal-test.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Alice Employer',
      role: UserRole.EMPLOYER
    });
    employerToken = jwt.sign(
      { userId: employerUser._id.toString(), role: UserRole.EMPLOYER, email: employerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 2. Create Developer (Bob)
    developerUser = await UserModel.create({
      email: 'bob.dev@paypal-test.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Bob Dev',
      role: UserRole.DEVELOPER,
      githubConnected: true,
      githubUsername: 'bobdev',
      paypalEmail: 'bob.dev.sb@sandbox.paypal.com'
    });
    developerToken = jwt.sign(
      { userId: developerUser._id.toString(), role: UserRole.DEVELOPER, email: developerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 3. Create Rogue Employer (Eve)
    otherEmployerUser = await UserModel.create({
      email: 'eve.employer@paypal-test.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Eve Intruder',
      role: UserRole.EMPLOYER
    });
    otherEmployerToken = jwt.sign(
      { userId: otherEmployerUser._id.toString(), role: UserRole.EMPLOYER, email: otherEmployerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 4. Create Project & GitHub Repo
    const installation = await GitHubInstallationModel.create({
      installationId: 7777,
      accountLogin: 'openproofpay-org',
      accountType: 'Organization',
      userId: employerUser._id,
      encryptedAccessToken: 'dummy'
    });

    repo = await GitHubRepositoryModel.create({
      installationId: installation._id,
      githubRepoId: 8888,
      fullName: 'openproofpay-org/payments-core',
      owner: 'openproofpay-org',
      name: 'payments-core',
      defaultBranch: 'main',
      private: false,
      htmlUrl: 'https://github.com/openproofpay-org/payments-core'
    });

    project = await ProjectModel.create({
      ownerId: employerUser._id,
      name: 'Fintech Escrow Core',
      description: 'PayPal v2 payment integration project',
      totalBudget: 10000,
      currency: 'USD',
      status: ProjectStatus.ACTIVE,
      githubRepoId: repo._id
    });

    // 5. Create Task
    task = await TaskModel.create({
      projectId: project._id,
      employerId: employerUser._id,
      assignedDeveloperId: developerUser._id,
      title: 'Milestone 1: Webhook HMAC Engine',
      description: 'Implement timing-safe cryptographic verification for PayPal webhooks',
      paymentAmount: 500,
      currency: 'USD',
      status: TaskStatus.SUBMITTED,
      minVerificationScore: 80,
      acceptanceCriteria: [
        { id: 'crit-sec-1', title: 'Timing-Safe Check', description: 'Zero timing side-channels', mandatory: true }
      ]
    });

    // 6. Create PullRequestSubmission
    submission = await PullRequestSubmissionModel.create({
      taskId: task._id,
      developerId: developerUser._id,
      repositoryId: repo._id,
      prNumber: 10,
      prUrl: 'https://github.com/openproofpay-org/payments-core/pull/10',
      headSha: 'c0ffee1234567890',
      baseBranch: 'main',
      headBranch: 'feat/webhook-engine',
      title: 'feat: add PayPal webhook timing-safe engine',
      status: SubmissionStatus.PENDING,
      additions: 250,
      deletions: 20,
      changedFilesCount: 4
    });
  });

  // ==========================================================================
  // GROUP 1: ORDER CREATION & AUTHORIZATION FLOW
  // ==========================================================================
  describe('1. PayPal Order v2 Creation & Authorization Flow', () => {
    it('creates PayPal Order v2 with server-validated amount and sets status APPROVAL_PENDING', async () => {
      const res = await request(app)
        .post(`/api/payments/tasks/${task._id}/create-order`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ intent: 'AUTHORIZE' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.order.id).toBeDefined();
      expect(res.body.data.payment.amount).toBe(500); // Server-validated, ignores any client tampering
      expect(res.body.data.payment.status).toBe(PaymentStatus.APPROVAL_PENDING);

      // Verify persisted in DB
      const dbPayment = await PaymentModel.findOne({ taskId: task._id });
      expect(dbPayment).not.toBeNull();
      expect(dbPayment!.paypalOrderId).toBe(res.body.data.order.id);
      expect(dbPayment!.status).toBe(PaymentStatus.APPROVAL_PENDING);
    });

    it('records authorization after employer approves checkout modal and sets status AUTHORIZED', async () => {
      // 1. Create order
      const createRes = await request(app)
        .post(`/api/payments/tasks/${task._id}/create-order`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ intent: 'AUTHORIZE' });

      const orderId = createRes.body.data.order.id;

      // 2. Authorize
      const authRes = await request(app)
        .post(`/api/payments/orders/${orderId}/authorize`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(authRes.status).toBe(200);
      expect(authRes.body.success).toBe(true);
      expect(authRes.body.data.status).toBe(PaymentStatus.AUTHORIZED);
      expect(authRes.body.data.paypalAuthorizationId).toBeDefined();

      // Check immutable PaymentEvent was logged
      const events = await PaymentEventModel.find({ paymentId: authRes.body.data.id });
      expect(events.length).toBeGreaterThanOrEqual(2); // CREATED -> APPROVAL_PENDING -> AUTHORIZED
      expect(events.some((e) => e.newStatus === PaymentStatus.AUTHORIZED)).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP 2: PROOF-TO-PAY GATE ENFORCEMENT & SECURITY CHECKS
  // ==========================================================================
  describe('2. Proof-to-Pay Gate Enforcement & Anti-IDOR Security', () => {
    it('rejects payment release with 403 Forbidden when called by a DEVELOPER', async () => {
      const res = await request(app)
        .post(`/api/payments/tasks/${task._id}/release`)
        .set('Authorization', `Bearer ${developerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_TASK_EMPLOYER');
    });

    it('rejects payment release with 403 Forbidden when called by a different employer (Eve)', async () => {
      const res = await request(app)
        .post(`/api/payments/tasks/${task._id}/release`)
        .set('Authorization', `Bearer ${otherEmployerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_TASK_EMPLOYER');
    });

    it('rejects payment release with 400 Bad Request if milestone task has NOT been explicitly approved (Rule 13)', async () => {
      // Task is in SUBMITTED state, NOT approved
      expect(task.status).not.toBe(TaskStatus.APPROVED);

      // Create an authorized payment
      await PaymentModel.create({
        taskId: task._id,
        projectId: project._id,
        employerId: employerUser._id,
        amount: 500,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED,
        paypalOrderId: 'ORDER-123',
        paypalAuthorizationId: 'AUTH-123',
        idempotencyKey: 'idemp-test-1'
      });

      const res = await request(app)
        .post(`/api/payments/tasks/${task._id}/release`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TASK_NOT_APPROVED');
      expect(res.body.error.message).toContain('Human employer review is required');
    });

    it('rejects payment release with 400 Bad Request if AI Verification Report is missing', async () => {
      // Set task to APPROVED
      task.status = TaskStatus.APPROVED;
      await task.save();

      // Create authorized payment
      await PaymentModel.create({
        taskId: task._id,
        projectId: project._id,
        employerId: employerUser._id,
        amount: 500,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED,
        paypalOrderId: 'ORDER-123',
        paypalAuthorizationId: 'AUTH-123',
        idempotencyKey: 'idemp-test-2'
      });

      const res = await request(app)
        .post(`/api/payments/tasks/${task._id}/release`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VERIFICATION_REPORT_MISSING');
    });

    it('rejects payment release with 400 Bad Request if Isolated Container Test record is missing', async () => {
      task.status = TaskStatus.APPROVED;
      await task.save();

      // Create VerificationReport
      await VerificationReportModel.create({
        submissionId: submission._id,
        taskId: task._id,
        commitSha: submission.headSha,
        score: 92,
        overallScore: 92,
        status: 'PASSED',
        verdict: VerificationVerdict.PASS,
        overallAssessment: 'Passes criteria',
        summary: 'Passes criteria',
        isOutdated: false,
        isDecisionSupportOnly: true
      });

      // Create authorized payment
      await PaymentModel.create({
        taskId: task._id,
        projectId: project._id,
        employerId: employerUser._id,
        amount: 500,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED,
        paypalOrderId: 'ORDER-123',
        paypalAuthorizationId: 'AUTH-123',
        idempotencyKey: 'idemp-test-3'
      });

      const res = await request(app)
        .post(`/api/payments/tasks/${task._id}/release`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TEST_EXECUTION_MISSING');
    });
  });

  // ==========================================================================
  // GROUP 3: SUCCESSFUL PROOF-TO-PAY CAPTURE & DOUBLE-CAPTURE PROTECTION
  // ==========================================================================
  describe('3. Proof-to-Pay Capture Execution & Double-Capture Prevention', () => {
    beforeEach(async () => {
      // Satisfy all Proof-to-Pay prerequisites:
      // 1. Task APPROVED
      task.status = TaskStatus.APPROVED;
      await task.save();

      // 2. AI Verification Report
      await VerificationReportModel.create({
        submissionId: submission._id,
        taskId: task._id,
        commitSha: submission.headSha,
        score: 90,
        overallScore: 90,
        status: 'PASSED',
        verdict: VerificationVerdict.PASS,
        overallAssessment: 'Verified clean deliverable',
        summary: 'Verified clean deliverable',
        isOutdated: false,
        isDecisionSupportOnly: true
      });

      // 3. Isolated Test Execution
      await TestExecutionModel.create({
        submissionId: submission._id,
        taskId: task._id,
        commitSha: submission.headSha,
        runtimeEnvironment: 'node:20-alpine',
        frameworkDetected: 'vitest',
        commandsExecuted: ['npx vitest run'],
        exitCode: 0,
        status: 'PASSED',
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        durationMs: 350,
        sanitizedLogs: 'All 10 tests passed.'
      });

      // 4. Authorized Payment
      await PaymentModel.create({
        taskId: task._id,
        projectId: project._id,
        employerId: employerUser._id,
        developerId: developerUser._id,
        amount: 500,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED,
        paypalOrderId: 'ORDER-SUCCESS-1',
        paypalAuthorizationId: 'AUTH-SUCCESS-1',
        idempotencyKey: 'idemp-success-1'
      });
    });

    it('captures authorized payment, transitions status to CAPTURED, and marks Task PAYMENT_COMPLETED', async () => {
      const res = await request(app)
        .post(`/api/payments/tasks/${task._id}/release`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect([PaymentStatus.CAPTURED, PaymentStatus.PAID_OUT]).toContain(res.body.data.status);
      expect(res.body.data.paypalCaptureId).toBeDefined();

      // Verify task lifecycle transitioned to PAYMENT_COMPLETED
      const updatedTask = await TaskModel.findById(task._id);
      expect(updatedTask!.status).toBe(TaskStatus.PAYMENT_COMPLETED);

      // Verify immutable PaymentEvents
      const events = await PaymentEventModel.find({ paymentId: res.body.data.id });
      expect(events.some((e) => e.newStatus === PaymentStatus.CAPTURED)).toBe(true);
    });

    it('strictly blocks duplicate release attempts with 409 Conflict', async () => {
      // 1. First release succeeds
      const firstRes = await request(app)
        .post(`/api/payments/tasks/${task._id}/release`)
        .set('Authorization', `Bearer ${employerToken}`);
      expect(firstRes.status).toBe(200);

      // 2. Second release attempt must be rejected immediately
      const secondRes = await request(app)
        .post(`/api/payments/tasks/${task._id}/release`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.error.code).toBe('PAYMENT_ALREADY_CAPTURED');
      expect(secondRes.body.error.message).toContain('Duplicate release blocked');
    });
  });

  // ==========================================================================
  // GROUP 4: CRYPTOGRAPHICALLY VERIFIED PAYPAL WEBHOOKS
  // ==========================================================================
  describe('4. Cryptographically Verified PayPal Webhook Engine', () => {
    it('rejects PayPal webhook if cryptographic headers are missing', async () => {
      const res = await request(app)
        .post('/api/webhooks/paypal')
        .send({ id: 'WH-EVENT-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Missing required PayPal webhook cryptographic headers');
    });

    it('processes verified PAYMENT.CAPTURE.COMPLETED webhook idempotently', async () => {
      // Create payment in AUTHORIZED state
      const payment = await PaymentModel.create({
        taskId: task._id,
        projectId: project._id,
        employerId: employerUser._id,
        amount: 500,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED,
        paypalOrderId: 'ORDER-WH-1',
        paypalAuthorizationId: 'AUTH-WH-1',
        idempotencyKey: 'idemp-wh-1'
      });

      const webhookPayload = {
        id: 'WH-EVENT-UNIQUE-101',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'CAP-WH-101',
          parent_payment: 'AUTH-WH-1',
          custom_id: task._id.toString(),
          status: 'COMPLETED'
        }
      };

      // First webhook delivery
      const res1 = await request(app)
        .post('/api/webhooks/paypal')
        .set('paypal-auth-algo', 'SHA256withRSA')
        .set('paypal-cert-url', 'https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-1')
        .set('paypal-transmission-id', 'trans-101')
        .set('paypal-transmission-sig', 'dummy_sig')
        .set('paypal-transmission-time', new Date().toISOString())
        .send(webhookPayload);

      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe('PROCESSED');

      // Verify payment transitioned to CAPTURED
      const updatedPayment = await PaymentModel.findById(payment._id);
      expect(updatedPayment!.status).toBe(PaymentStatus.CAPTURED);
      expect(updatedPayment!.paypalCaptureId).toBe('CAP-WH-101');

      // Second identical webhook delivery (deduplicated by event.id)
      const res2 = await request(app)
        .post('/api/webhooks/paypal')
        .set('paypal-auth-algo', 'SHA256withRSA')
        .set('paypal-cert-url', 'https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-1')
        .set('paypal-transmission-id', 'trans-101')
        .set('paypal-transmission-sig', 'dummy_sig')
        .set('paypal-transmission-time', new Date().toISOString())
        .send(webhookPayload);

      expect(res2.status).toBe(200);
      expect(res2.body.data.duplicate).toBe(true);
      expect(res2.body.data.status).toBe('IGNORED_DUPLICATE');
    });
  });
});
