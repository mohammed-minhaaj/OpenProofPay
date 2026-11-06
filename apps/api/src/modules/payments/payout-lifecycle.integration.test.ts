import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TaskModel } from '../../models/Task.js';
import { PaymentModel } from '../../models/Payment.js';
import { UserModel } from '../../models/User.js';
import { ProjectModel } from '../../models/Project.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { VerificationReportModel } from '../../models/VerificationReport.js';
import { PaymentsService } from './payments.service.js';
import { PayPalClient } from './PayPalClient.js';
import { PaymentStatus, TaskStatus, UserRole, VerificationVerdict } from '@openproofpay/shared';

describe('Phase 4: PayPal Sandbox Lifecycle - Capture, Partial Failure, and Safe Payout Retry', () => {
  let mongoServer: MongoMemoryServer;
  let employerUser: any;
  let developerUser: any;
  let project: any;
  let task: any;
  let submission: any;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();

    employerUser = await UserModel.create({
      email: 'employer@sandbox.paypal.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstu',
      role: UserRole.EMPLOYER,
      name: 'Alice Employer'
    });

    developerUser = await UserModel.create({
      email: 'dev@sandbox.paypal.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstu',
      role: UserRole.DEVELOPER,
      name: 'Bob Developer',
      paypalEmail: 'bob-receiver@sandbox.paypal.com'
    });

    project = await ProjectModel.create({
      name: 'OpenProofPay Core',
      ownerId: employerUser._id
    });

    task = await TaskModel.create({
      projectId: project._id,
      employerId: employerUser._id,
      assignedDeveloperId: developerUser._id,
      title: 'Implement Webhook Security',
      description: 'Add HMAC signature validation to webhooks',
      paymentAmount: 250,
      currency: 'USD',
      status: TaskStatus.APPROVED,
      acceptanceCriteria: [
        { id: 'crit-1', title: 'HMAC validation', description: 'Constant time compare', mandatory: true }
      ]
    });

    submission = await PullRequestSubmissionModel.create({
      taskId: task._id,
      developerId: developerUser._id,
      prNumber: 42,
      prUrl: 'https://github.com/openproofpay/repo/pull/42',
      title: 'Fix HMAC validation',
      headBranch: 'feature/webhook-hmac',
      baseBranch: 'main',
      headSha: 'c0ffee1234567890abcdef1234567890abcdef12',
      status: 'ACCEPTED'
    });

    task.acceptedSubmissionId = submission._id;
    await task.save();

    await VerificationReportModel.create({
      submissionId: submission._id,
      taskId: task._id,
      commitSha: 'c0ffee1234567890abcdef1234567890abcdef12',
      overallScore: 95,
      verdict: VerificationVerdict.PASS,
      status: 'PASSED',
      isOutdated: false,
      ciTestStatus: 'PASSED',
      requirementAnalysis: []
    });
  });

  it('handles capture-success with payout-failure: retains CAPTURED status, records error, does not auto-refund', async () => {
    await PaymentModel.create({
      taskId: task._id,
      projectId: project._id,
      employerId: employerUser._id,
      developerId: developerUser._id,
      amount: 250,
      currency: 'USD',
      status: PaymentStatus.AUTHORIZED,
      paypalOrderId: 'ORDER-PAYOUT-FAIL-1',
      paypalAuthorizationId: 'AUTH-PAYOUT-FAIL-1',
      idempotencyKey: 'idemp-payout-fail'
    });

    // Mock PayPal capture to succeed, but Payouts API to fail (e.g. Sandbox receiver account restricted)
    PayPalClient.captureAuthorization = async () => ({
      id: 'CAPTURE-SUCCESS-999',
      status: 'COMPLETED'
    }) as any;

    PayPalClient.createPayout = async () => {
      throw new Error('RECEIVER_ACCOUNT_RESTRICTED: Developer sandbox account cannot accept mass payouts');
    };

    const releasedPayment = await PaymentsService.releasePayment(
      task._id.toString(),
      employerUser._id.toString()
    );

    // Verify Section 5 requirement:
    // "If capture succeeds but payout fails: keep CAPTURED, mark payout FAILED/PENDING with the PayPal error, do not capture again, show a clear banner to the admin with a Retry Payout button."
    expect(releasedPayment.status).toBe(PaymentStatus.CAPTURED);
    expect(releasedPayment.paypalCaptureId).toBe('CAPTURE-SUCCESS-999');
    expect(releasedPayment.payoutStatus).toBe('FAILED');
    expect(releasedPayment.payoutError).toContain('RECEIVER_ACCOUNT_RESTRICTED');
  });

  it('safely retries developer payout with incremented stable idempotency key', async () => {
    const payment = await PaymentModel.create({
      taskId: task._id,
      projectId: project._id,
      employerId: employerUser._id,
      developerId: developerUser._id,
      amount: 250,
      currency: 'USD',
      status: PaymentStatus.CAPTURED,
      paypalOrderId: 'ORDER-PAYOUT-RETRY',
      paypalAuthorizationId: 'AUTH-PAYOUT-RETRY',
      paypalCaptureId: 'CAPTURE-SUCCESS-999',
      payoutStatus: 'FAILED',
      payoutError: 'Previous transient network timeout',
      payoutRetries: 0,
      idempotencyKey: 'idemp-retry-test'
    });

    let recordedBatchId = '';
    let recordedIdempotencyKey = '';

    PayPalClient.createPayout = async (payload: any, idempotencyKey?: string) => {
      recordedBatchId = payload.sender_batch_header.sender_batch_id;
      recordedIdempotencyKey = idempotencyKey || '';
      return {
        batch_header: {
          payout_batch_id: 'BATCH-RETRY-SUCCESS-123',
          batch_status: 'PENDING'
        }
      } as any;
    };

    const retriedPayment = await PaymentsService.retryPayout(
      task._id.toString(),
      employerUser._id.toString()
    );

    expect(retriedPayment.status).toBe(PaymentStatus.PAID_OUT);
    expect(retriedPayment.payoutStatus).toBe('SUCCESS');
    expect(retriedPayment.payoutRetries).toBe(1);
    expect(retriedPayment.paypalPayoutBatchId).toBe('BATCH-RETRY-SUCCESS-123');
    expect(recordedBatchId).toContain(`payout-${payment._id}-1`);
    expect(recordedIdempotencyKey).toContain(`payout-${payment._id}-1`);
  });

  it('rejects duplicate payout retry once payout has already completed', async () => {
    await PaymentModel.create({
      taskId: task._id,
      projectId: project._id,
      employerId: employerUser._id,
      developerId: developerUser._id,
      amount: 250,
      currency: 'USD',
      status: PaymentStatus.PAID_OUT,
      paypalOrderId: 'ORDER-COMPLETED',
      paypalAuthorizationId: 'AUTH-COMPLETED',
      paypalCaptureId: 'CAPTURE-COMPLETED',
      paypalPayoutBatchId: 'BATCH-ALREADY-DONE',
      payoutStatus: 'SUCCESS',
      idempotencyKey: 'idemp-already-done'
    });

    await expect(
      PaymentsService.retryPayout(task._id.toString(), employerUser._id.toString())
    ).rejects.toThrow('Developer payout has already completed successfully');
  });
});
