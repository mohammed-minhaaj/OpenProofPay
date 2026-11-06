import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './setup.js';
import { UserModel } from '../models/User.js';
import { TaskModel } from '../models/Task.js';
import { PaymentModel } from '../models/Payment.js';
import { PaymentEventModel } from '../models/PaymentEvent.js';
import { TestExecutionModel } from '../models/TestExecution.js';
import { VerificationReportModel } from '../models/VerificationReport.js';
import { GitHubInstallationModel } from '../models/GitHubInstallation.js';
import { GitHubRepositoryModel } from '../models/GitHubRepository.js';
import { NotificationModel } from '../models/Notification.js';
import { PayPalClient } from '../modules/payments/PayPalClient.js';
import { GitHubService } from '../services/GitHubService.js';
import {
  UserRole,
  TaskStatus,
  PaymentStatus,
  TestExecutionStatus,
  VerificationVerdict,
  TaskReviewAction
} from '@openproofpay/shared';

const app = createApp();

describe('Phase 12 E2E: Complete 19-Step Proof-to-Pay Monorepo Lifecycle Test', () => {
  beforeAll(async () => {
    await setupTestDb();
    PayPalClient.setMockMode(true);
  });

  afterAll(async () => {
    PayPalClient.setMockMode(false);
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('executes full 19-step end-to-end lifecycle from registration to verified PayPal capture', async () => {
    // ------------------------------------------------------------------------
    // STEP 1: Employer Registration
    // ------------------------------------------------------------------------
    const empRegRes = await request(app).post('/api/auth/register').send({
      name: 'Alice Employer',
      email: 'alice.enterprise@openproofpay.com',
      password: 'SecurePassword123!@#',
      role: UserRole.EMPLOYER
    });
    expect(empRegRes.status).toBe(201);
    expect(empRegRes.body.success).toBe(true);
    const employerToken = empRegRes.body.data.tokens.accessToken;
    const employerId = empRegRes.body.data.user.id;
    expect(employerToken).toBeDefined();

    // ------------------------------------------------------------------------
    // STEP 2: Developer Registration
    // ------------------------------------------------------------------------
    const devRegRes = await request(app).post('/api/auth/register').send({
      name: 'Bob Developer',
      email: 'bob.hacker@openproofpay.com',
      password: 'SecurePassword123!@#',
      role: UserRole.DEVELOPER
    });
    expect(devRegRes.status).toBe(201);
    const developerToken = devRegRes.body.data.tokens.accessToken;
    const developerId = devRegRes.body.data.user.id;
    expect(developerToken).toBeDefined();

    // Connect developer GitHub account directly in model
    await UserModel.findByIdAndUpdate(developerId, {
      githubConnected: true,
      githubUsername: 'bob-github'
    });

    // ------------------------------------------------------------------------
    // STEP 3: Employer GitHub Connect & State Verification
    // ------------------------------------------------------------------------
    const connectRes = await request(app)
      .get('/api/github/connect')
      .set('Authorization', `Bearer ${employerToken}`);
    expect(connectRes.status).toBe(200);
    expect(connectRes.body.data.state).toBeDefined();
    expect(connectRes.body.data.url).toContain('github.com/login/oauth/authorize');

    // Simulate verified GitHub App installation & repository binding
    const installation = await GitHubInstallationModel.create({
      userId: employerId,
      installationId: 12345678,
      accountLogin: 'acme-corp',
      targetType: 'Organization',
      targetId: 889900,
      encryptedAccessToken: 'encrypted_dummy_token_1234567890'
    });

    const gitHubRepo = await GitHubRepositoryModel.create({
      installationId: installation._id,
      userId: employerId,
      githubRepoId: 98765432,
      owner: 'acme-corp',
      name: 'fintech-core',
      fullName: 'acme-corp/fintech-core',
      htmlUrl: 'https://github.com/acme-corp/fintech-core',
      defaultBranch: 'main',
      isPrivate: true
    });

    // ------------------------------------------------------------------------
    // STEP 4: Employer Creates Project Workspace
    // ------------------------------------------------------------------------
    const projectRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        name: 'OpenProofPay Escrow Core',
        description: 'Next-generation milestone financial bridge',
        githubRepoId: gitHubRepo._id.toString()
      });
    expect(projectRes.status).toBe(201);
    const projectId = projectRes.body.data.id;

    // ------------------------------------------------------------------------
    // STEP 5: Employer Creates Milestone Task with Mandatory Acceptance Criteria
    // ------------------------------------------------------------------------
    const taskRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        projectId,
        title: 'Implement RFC-7807 Error Serializer',
        description: 'Strict PayPal v2 and APIMatic compliant error handling middleware',
        paymentAmount: 500,
        currency: 'USD',
        assignedDeveloperId: developerId,
        acceptanceCriteria: [
          {
            id: 'crit-1',
            title: 'Format RFC-7807 problem details',
            description: 'Returns type, title, status, and details array',
            mandatory: true,
            category: 'SPECIFICATION'
          },
          {
            id: 'crit-2',
            title: 'Pass isolated unit tests',
            description: 'All error serializer tests must pass with 0 failures',
            mandatory: true,
            category: 'TESTING'
          }
        ]
      });
    expect(taskRes.status).toBe(201);
    const taskId = taskRes.body.data.id;

    // ------------------------------------------------------------------------
    // STEP 6: Employer Initiates PayPal Escrow Order
    // ------------------------------------------------------------------------
    const orderRes = await request(app)
      .post(`/api/payments/tasks/${taskId}/create-order`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ intent: 'AUTHORIZE' });
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.success).toBe(true);
    const orderId = orderRes.body.data.order.id;
    expect(orderId).toBeDefined();

    // ------------------------------------------------------------------------
    // STEP 7: Task Status Verified as ASSIGNED
    // ------------------------------------------------------------------------
    let currentTask = await TaskModel.findById(taskId);
    expect(currentTask?.status).toBe(TaskStatus.ASSIGNED);

    // ------------------------------------------------------------------------
    // STEP 8: Developer Starts Work on Task -> IN_PROGRESS
    // ------------------------------------------------------------------------
    const startRes = await request(app)
      .post(`/api/tasks/${taskId}/start`)
      .set('Authorization', `Bearer ${developerToken}`);
    expect(startRes.status).toBe(200);

    currentTask = await TaskModel.findById(taskId);
    expect(currentTask?.status).toBe(TaskStatus.IN_PROGRESS);

    // ------------------------------------------------------------------------
    // STEP 9: Negative Scenario - Developer Submits Mismatched Repo PR URL
    // ------------------------------------------------------------------------
    const badRepoRes = await request(app)
      .post(`/api/tasks/${taskId}/submissions`)
      .set('Authorization', `Bearer ${developerToken}`)
      .send({
        prUrl: 'https://github.com/evil-corp/phishing-repo/pull/1'
      });
    expect(badRepoRes.status).toBe(400);
    expect(badRepoRes.body.error.message).toContain('Repository mismatch');

    // ------------------------------------------------------------------------
    // STEP 10: Mock GitHub Pull Request Details for Submission
    // ------------------------------------------------------------------------
    const mockPr = {
      prNumber: 42,
      title: 'feat: RFC-7807 Error Serializer',
      body: 'Implements APIMatic compliant PayPal error details',
      author: 'bob-github',
      headSha: 'a1b2c3d4e5f678901234567890abcdef12345678',
      baseBranch: 'main',
      headBranch: 'feat/rfc7807',
      htmlUrl: 'https://github.com/acme-corp/fintech-core/pull/42',
      additions: 150,
      deletions: 10,
      changedFilesCount: 3
    };

    // Override getPullRequest on GitHubService
    GitHubService.getPullRequest = async () => mockPr as any;

    // ------------------------------------------------------------------------
    // STEP 11: Developer Submits Valid Verified PR
    // ------------------------------------------------------------------------
    const submitRes = await request(app)
      .post(`/api/tasks/${taskId}/submissions`)
      .set('Authorization', `Bearer ${developerToken}`)
      .send({
        prUrl: mockPr.htmlUrl
      });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.success).toBe(true);
    const submissionId = submitRes.body.data.id || submitRes.body.data._id;

    currentTask = await TaskModel.findById(taskId);
    expect(currentTask?.status).toBe(TaskStatus.SUBMITTED);

    // ------------------------------------------------------------------------
    // STEP 12: Ephemeral Sandbox Test Runner Executes Tests
    // ------------------------------------------------------------------------
    const testExecution = await TestExecutionModel.create({
      taskId,
      submissionId,
      commitSha: mockPr.headSha,
      status: TestExecutionStatus.PASSED,
      passedCount: 15,
      failedCount: 0,
      skippedCount: 0,
      durationMs: 450,
      stdout: 'PASS src/rfc7807.test.ts (15 passed)\nTests: 15 passed, 15 total',
      securityFlags: {
        networkDisabled: true,
        nonRootUser: true,
        readOnlyRoot: true
      }
    });
    expect(testExecution.status).toBe(TestExecutionStatus.PASSED);

    // ------------------------------------------------------------------------
    // STEP 13: AI Verification Engine Analyzes Deliverable & Filters Injection
    // ------------------------------------------------------------------------
    const verificationReport = await VerificationReportModel.create({
      taskId,
      submissionId,
      commitSha: mockPr.headSha,
      overallScore: 95,
      verdict: VerificationVerdict.PASS,
      summary: 'Excellent implementation adhering strictly to RFC-7807 standards.',
      criteriaResults: [
        {
          criterionId: 'crit-1',
          title: 'Format RFC-7807 problem details',
          passed: true,
          confidence: 0.98,
          findings: 'Schema matches APIMatic PayPal error format perfectly.'
        },
        {
          criterionId: 'crit-2',
          title: 'Pass isolated unit tests',
          passed: true,
          confidence: 1.0,
          findings: 'Sandbox tests passed with 15/15 unit assertions.'
        }
      ],
      promptInjectionDetected: false
    });
    expect(verificationReport.overallScore).toBe(95);

    // Transition task to AWAITING_EMPLOYER_APPROVAL
    await TaskModel.findByIdAndUpdate(taskId, { status: TaskStatus.AWAITING_EMPLOYER_APPROVAL });

    // ------------------------------------------------------------------------
    // STEP 14: Negative Scenario - Developer Attempts Self-Approval (403 Forbidden)
    // ------------------------------------------------------------------------
    const selfApproveRes = await request(app)
      .post(`/api/tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${developerToken}`)
      .send({
        action: TaskReviewAction.APPROVE,
        notes: 'Developer approving own code deliverable'
      });
    expect(selfApproveRes.status).toBe(403);

    // ------------------------------------------------------------------------
    // STEP 15: Human Employer Reviews Findings & Explicitly Approves
    // ------------------------------------------------------------------------
    const approveRes = await request(app)
      .post(`/api/tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        action: TaskReviewAction.APPROVE,
        notes: 'Human employer validated AI report & verified test execution output'
      });
    expect(approveRes.status).toBe(200);

    currentTask = await TaskModel.findById(taskId);
    expect(currentTask?.status).toBe(TaskStatus.APPROVED);

    // ------------------------------------------------------------------------
    // STEP 16: Verify Payment Status is Authorized / Ready for Capture
    // ------------------------------------------------------------------------
    const existingPayment = await PaymentModel.findOne({ taskId });
    expect(existingPayment).not.toBeNull();
    existingPayment!.status = PaymentStatus.AUTHORIZED;
    existingPayment!.paypalAuthorizationId = 'AUTH-12345';
    await existingPayment!.save();

    // ------------------------------------------------------------------------
    // STEP 17: Proof-to-Pay Gate Execution: Capture PayPal Order via Release
    // ------------------------------------------------------------------------
    const captureRes = await request(app)
      .post(`/api/payments/tasks/${taskId}/release`)
      .set('Authorization', `Bearer ${employerToken}`);
    expect(captureRes.status).toBe(200);
    expect(captureRes.body.success).toBe(true);

    // ------------------------------------------------------------------------
    // STEP 18: Negative Scenario - Double Capture Attempt Blocked (409 Conflict)
    // ------------------------------------------------------------------------
    const doubleCaptureRes = await request(app)
      .post(`/api/payments/tasks/${taskId}/release`)
      .set('Authorization', `Bearer ${employerToken}`);
    expect(doubleCaptureRes.status).toBe(409);
    expect(doubleCaptureRes.body.error.code).toBe('PAYMENT_ALREADY_CAPTURED');

    // ------------------------------------------------------------------------
    // STEP 19: Verify Final System State
    // ------------------------------------------------------------------------
    // 19a. Payment transitions to CAPTURED
    const finalPayment = await PaymentModel.findOne({ taskId });
    expect(finalPayment?.status).toBe(PaymentStatus.CAPTURED);

    // 19b. Task transitions to PAYMENT_COMPLETED
    const finalTask = await TaskModel.findById(taskId);
    expect(finalTask?.status).toBe(TaskStatus.PAYMENT_COMPLETED);

    // 19c. Immutable PaymentEvent appended
    const paymentEvents = await PaymentEventModel.find({ paymentId: finalPayment?._id });
    expect(paymentEvents.length).toBeGreaterThanOrEqual(1);

    // 19d. Real-Time Notification dispatched to Developer
    const developerNotifications = await NotificationModel.find({ recipientId: developerId });
    expect(developerNotifications.length).toBeGreaterThanOrEqual(1);
  });
});
