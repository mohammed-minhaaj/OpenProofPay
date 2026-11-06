import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from '../../test/setup.js';
import { UserModel } from '../../models/User.js';
import { ProjectModel } from '../../models/Project.js';
import { TaskModel } from '../../models/Task.js';
import { PaymentModel } from '../../models/Payment.js';
import { PaymentEventModel } from '../../models/PaymentEvent.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { NotificationModel } from '../../models/Notification.js';
import { PayPalClient } from '../payments/PayPalClient.js';
import { env } from '../../config/env.js';
import {
  UserRole,
  TaskStatus,
  PaymentStatus,
  DisputeStatus,
  AuditAction,
  NotificationType
} from '@openproofpay/shared';

const app = createApp();

describe('Phase 11: Security Hardening, Immutability, Notifications & Disputes', () => {
  let employerUser: InstanceType<typeof UserModel>;
  let developerUser: InstanceType<typeof UserModel>;
  let otherUser: InstanceType<typeof UserModel>;
  let adminUser: InstanceType<typeof UserModel>;

  let employerToken: string;
  let developerToken: string;
  let otherToken: string;
  let adminToken: string;

  let project: InstanceType<typeof ProjectModel>;
  let task: InstanceType<typeof TaskModel>;
  let payment: InstanceType<typeof PaymentModel>;

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

    // 1. Create Employer
    employerUser = await UserModel.create({
      email: 'alice.employer@example.com',
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
      email: 'bob.developer@example.com',
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

    // 3. Create Unrelated / Attacker User
    otherUser = await UserModel.create({
      email: 'eve.intruder@example.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Eve Intruder',
      role: UserRole.DEVELOPER,
      githubConnected: false
    });
    otherToken = jwt.sign(
      { userId: otherUser._id.toString(), role: UserRole.DEVELOPER, email: otherUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 4. Create Human Administrator
    adminUser = await UserModel.create({
      email: 'admin.super@example.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Super Admin',
      role: UserRole.ADMIN,
      githubConnected: false
    });
    adminToken = jwt.sign(
      { userId: adminUser._id.toString(), role: UserRole.ADMIN, email: adminUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 5. Create Project & Task
    project = await ProjectModel.create({
      name: 'Security Test Project',
      description: 'Hardened project workspace',
      ownerId: employerUser._id,
      collaborators: []
    });

    task = await TaskModel.create({
      title: 'Implement Cryptographic Verification Engine',
      description: 'Milestone requiring cryptographic verification and escrow',
      projectId: project._id,
      employerId: employerUser._id,
      assignedDeveloperId: developerUser._id,
      status: TaskStatus.AWAITING_EMPLOYER_APPROVAL,
      paymentAmount: 500,
      currency: 'USD',
      acceptanceCriteria: [
        {
          id: 'crit-1',
          title: 'Sign payloads',
          description: 'Payloads must be signed',
          mandatory: true,
          category: 'SECURITY'
        }
      ]
    });

    // 6. Create Captured Payment for the task
    payment = await PaymentModel.create({
      taskId: task._id,
      projectId: project._id,
      employerId: employerUser._id,
      developerId: developerUser._id,
      amount: 500,
      currency: 'USD',
      status: PaymentStatus.CAPTURED,
      paypalOrderId: 'ORDER-123456',
      paypalCaptureId: 'CAPTURE-987654',
      idempotencyKey: `idem-sec-test-${Date.now()}`
    });
  });

  // ==========================================================================
  // SECTION 1: IMMUTABLE AUDIT LOG & PAYMENT EVENT COLLECTIONS
  // ==========================================================================
  describe('Immutable Audit Logging & Financial Event Collections', () => {
    it('allows inserting a new AuditLog record', async () => {
      const log = await AuditLogModel.create({
        actorId: employerUser._id,
        actorRole: UserRole.EMPLOYER,
        action: AuditAction.TASK_CREATED,
        resourceType: 'Task',
        resourceId: task._id.toString(),
        metadata: { title: task.title }
      });

      expect(log._id).toBeDefined();
      expect(log.action).toBe(AuditAction.TASK_CREATED);
    });

    it('blocks mutation via AuditLogModel.updateOne() and throws IMMUTABLE_LOG error', async () => {
      const log = await AuditLogModel.create({
        actorId: employerUser._id,
        actorRole: UserRole.EMPLOYER,
        action: AuditAction.TASK_CREATED,
        resourceType: 'Task',
        resourceId: task._id.toString()
      });

      await expect(
        AuditLogModel.updateOne({ _id: log._id }, { $set: { action: AuditAction.USER_LOGIN } })
      ).rejects.toThrow(/IMMUTABLE_LOG/);
    });

    it('blocks deletion via AuditLogModel.deleteOne() and throws IMMUTABLE_LOG error', async () => {
      const log = await AuditLogModel.create({
        actorId: employerUser._id,
        actorRole: UserRole.EMPLOYER,
        action: AuditAction.TASK_CREATED,
        resourceType: 'Task',
        resourceId: task._id.toString()
      });

      await expect(
        AuditLogModel.deleteOne({ _id: log._id })
      ).rejects.toThrow(/IMMUTABLE_LOG/);
    });

    it('blocks mutation via existing document .save() on AuditLog', async () => {
      const log = await AuditLogModel.create({
        actorId: employerUser._id,
        actorRole: UserRole.EMPLOYER,
        action: AuditAction.TASK_CREATED,
        resourceType: 'Task',
        resourceId: task._id.toString()
      });

      log.action = AuditAction.USER_LOGIN;
      await expect(log.save()).rejects.toThrow(/IMMUTABLE_LOG/);
    });

    it('allows inserting a new PaymentEvent record', async () => {
      const event = await PaymentEventModel.create({
        paymentId: payment._id,
        eventType: 'PAYMENT_CAPTURED',
        previousStatus: PaymentStatus.CAPTURE_PENDING,
        newStatus: PaymentStatus.CAPTURED,
        rawPayloadSummary: { amount: 500 }
      });

      expect(event._id).toBeDefined();
      expect(event.newStatus).toBe(PaymentStatus.CAPTURED);
    });

    it('blocks mutation via PaymentEventModel.updateOne() and throws IMMUTABLE_LOG error', async () => {
      const event = await PaymentEventModel.create({
        paymentId: payment._id,
        eventType: 'PAYMENT_CAPTURED',
        previousStatus: PaymentStatus.CAPTURE_PENDING,
        newStatus: PaymentStatus.CAPTURED
      });

      await expect(
        PaymentEventModel.updateOne({ _id: event._id }, { $set: { newStatus: PaymentStatus.REFUNDED } })
      ).rejects.toThrow(/IMMUTABLE_LOG/);
    });

    it('blocks deletion via PaymentEventModel.deleteOne() and throws IMMUTABLE_LOG error', async () => {
      const event = await PaymentEventModel.create({
        paymentId: payment._id,
        eventType: 'PAYMENT_CAPTURED',
        previousStatus: PaymentStatus.CAPTURE_PENDING,
        newStatus: PaymentStatus.CAPTURED
      });

      await expect(
        PaymentEventModel.deleteOne({ _id: event._id })
      ).rejects.toThrow(/IMMUTABLE_LOG/);
    });
  });

  // ==========================================================================
  // SECTION 2: AUDIT LOG QUERYING & ANTI-IDOR DEFENSES
  // ==========================================================================
  describe('Audit Log Endpoint (GET /api/audit-logs) & Anti-IDOR Scoping', () => {
    beforeEach(async () => {
      // Create distinct logs for Alice and other contexts
      await AuditLogModel.create({
        actorId: employerUser._id,
        actorRole: UserRole.EMPLOYER,
        action: AuditAction.TASK_CREATED,
        resourceType: 'Task',
        resourceId: task._id.toString(),
        metadata: { note: 'Alice created task' }
      });

      await AuditLogModel.create({
        actorId: otherUser._id,
        actorRole: UserRole.DEVELOPER,
        action: AuditAction.USER_LOGIN,
        resourceType: 'User',
        resourceId: otherUser._id.toString(),
        metadata: { note: 'Eve private login' }
      });
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/audit-logs');
      expect(res.status).toBe(401);
    });

    it('allows Admin to view all audit logs across all actors and resources', async () => {
      const res = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('scopes non-admin results so Eve cannot see Alice’s private task audit logs', async () => {
      const res = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Eve should only see her own logs, none of Alice's task logs
      const hasAliceTaskLog = res.body.data.some(
        (log: any) => log.resourceId === task._id.toString()
      );
      expect(hasAliceTaskLog).toBe(false);
    });
  });

  // ==========================================================================
  // SECTION 3: REAL-TIME NOTIFICATIONS (REST & SSE STREAM)
  // ==========================================================================
  describe('Notifications System', () => {
    let aliceNotification: InstanceType<typeof NotificationModel>;

    beforeEach(async () => {
      aliceNotification = await NotificationModel.create({
        recipientId: employerUser._id,
        type: NotificationType.TASK_ASSIGNED,
        title: 'Task Assigned',
        message: 'Developer assigned to your task',
        resourceType: 'Task',
        resourceId: task._id,
        read: false
      });

      await NotificationModel.create({
        recipientId: developerUser._id,
        type: NotificationType.PAYMENT_COMPLETED,
        title: 'Payment Complete',
        message: 'Payment received',
        resourceType: 'Payment',
        resourceId: payment._id,
        read: false
      });
    });

    it('rejects unauthenticated SSE connection request to /stream with 401', async () => {
      const res = await request(app).get('/api/notifications/stream');
      expect(res.status).toBe(401);
    });

    it('lists notifications strictly scoped to authenticated user', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0]._id).toBe(aliceNotification._id.toString());
      expect(res.body.unreadCount).toBe(1);
    });

    it('allows marking single notification as read', async () => {
      const res = await request(app)
        .patch(`/api/notifications/${aliceNotification._id}/read`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.read).toBe(true);

      const updated = await NotificationModel.findById(aliceNotification._id);
      expect(updated?.read).toBe(true);
    });

    it('prevents IDOR: Eve cannot mark Alice’s notification as read', async () => {
      const res = await request(app)
        .patch(`/api/notifications/${aliceNotification._id}/read`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('marks all notifications as read for current user', async () => {
      const res = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.modifiedCount).toBe(1);

      const check = await NotificationModel.find({ recipientId: employerUser._id, read: false });
      expect(check.length).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 4: DISPUTE WORKFLOW & FINANCIAL SAFETY RULE
  // ==========================================================================
  describe('Dispute Lifecycle & Human Admin Financial Safety Gate', () => {
    it('allows employer to raise a dispute and freezes task status to DISPUTED', async () => {
      const res = await request(app)
        .post(`/api/tasks/${task._id}/disputes`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          reason: 'Deliverable fails cryptographic signature verification',
          evidenceSummary: 'Unit test failures and signature mismatch on payload'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(DisputeStatus.OPEN);

      // Verify task status was frozen to DISPUTED
      const updatedTask = await TaskModel.findById(task._id);
      expect(updatedTask?.status).toBe(TaskStatus.DISPUTED);

      // Verify immutable audit log was generated
      const disputeId = res.body.data.id || res.body.data._id;
      const audit = await AuditLogModel.findOne({
        action: AuditAction.DISPUTE_RAISED,
        resourceId: disputeId
      });
      expect(audit).not.toBeNull();
    });

    it('blocks raising a second concurrent dispute on the same task', async () => {
      await request(app)
        .post(`/api/tasks/${task._id}/disputes`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          reason: 'First dispute on deliverable'
        });

      const second = await request(app)
        .post(`/api/tasks/${task._id}/disputes`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          reason: 'Second conflicting dispute'
        });

      expect(second.status).toBe(409);
    });

    it('allows developer to append counter-evidence message to dispute', async () => {
      const disputeRes = await request(app)
        .post(`/api/tasks/${task._id}/disputes`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          reason: 'Deliverable claims non-compliance'
        });

      const disputeId = disputeRes.body.data.id || disputeRes.body.data._id;

      const msgRes = await request(app)
        .post(`/api/disputes/${disputeId}/messages`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          message: 'The cryptographic signatures pass against public key v2 in PR #42',
          attachments: [{ title: 'Passing test screenshot', url: 'https://cdn.example.com/proof.png' }]
        });

      expect(msgRes.status).toBe(200);
      expect(msgRes.body.data.messages.length).toBe(1);
      expect(msgRes.body.data.messages[0].senderRole).toBe(UserRole.DEVELOPER);
    });

    it('blocks third-party (Eve) from accessing or posting in Alice/Bob dispute (anti-IDOR)', async () => {
      const disputeRes = await request(app)
        .post(`/api/tasks/${task._id}/disputes`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          reason: 'Confidential dispute between Alice and Bob'
        });

      const disputeId = disputeRes.body.data.id || disputeRes.body.data._id;

      const getRes = await request(app)
        .get(`/api/disputes/${disputeId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(getRes.status).toBe(403);

      const postRes = await request(app)
        .post(`/api/disputes/${disputeId}/messages`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ message: 'Eve injected message' });

      expect(postRes.status).toBe(403);
    });

    it('FINANCIAL SAFETY: Rejects non-admin attempt to resolve dispute (403 Forbidden)', async () => {
      const disputeRes = await request(app)
        .post(`/api/tasks/${task._id}/disputes`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          reason: 'Dispute requiring resolution'
        });

      const disputeId = disputeRes.body.data.id || disputeRes.body.data._id;

      // Employer attempts resolution
      const empAttempt = await request(app)
        .post(`/api/disputes/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          verdict: DisputeStatus.RESOLVED_FOR_EMPLOYER,
          explanation: 'Employer trying to self-refund',
          processRefund: true
        });

      expect(empAttempt.status).toBe(403);

      // Developer attempts resolution
      const devAttempt = await request(app)
        .post(`/api/disputes/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          verdict: DisputeStatus.RESOLVED_FOR_DEVELOPER,
          explanation: 'Developer trying to force payout'
        });

      expect(devAttempt.status).toBe(403);
    });

    it('HUMAN ADMIN RESOLUTION: Admin resolves dispute in favor of Employer with PayPal Refund', async () => {
      const disputeRes = await request(app)
        .post(`/api/tasks/${task._id}/disputes`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          reason: 'Critical deliverable defect'
        });

      const disputeId = disputeRes.body.data.id || disputeRes.body.data._id;

      const resolveRes = await request(app)
        .post(`/api/disputes/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          verdict: DisputeStatus.RESOLVED_FOR_EMPLOYER,
          explanation: 'Independent human admin confirmed criteria failure. Issuing full refund to employer.',
          processRefund: true
        });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.success).toBe(true);
      expect(resolveRes.body.data.status).toBe(DisputeStatus.RESOLVED_FOR_EMPLOYER);
      expect(resolveRes.body.data.resolution.refundTransactionId).toBeDefined();

      // Verify payment transitioned to REFUNDED
      const updatedPayment = await PaymentModel.findById(payment._id);
      expect(updatedPayment?.status).toBe(PaymentStatus.REFUNDED);

      // Verify immutable PaymentEvent appended
      const paymentEvent = await PaymentEventModel.findOne({
        paymentId: payment._id,
        eventType: 'PAYMENT_CAPTURE_REFUNDED'
      });
      expect(paymentEvent).not.toBeNull();
      expect(paymentEvent?.newStatus).toBe(PaymentStatus.REFUNDED);

      // Verify immutable AuditLog appended
      const audit = await AuditLogModel.findOne({
        action: AuditAction.DISPUTE_RESOLVED,
        resourceId: disputeId
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorRole).toBe(UserRole.ADMIN);

      // Verify task status set to CLOSED
      const updatedTask = await TaskModel.findById(task._id);
      expect(updatedTask?.status).toBe(TaskStatus.CLOSED);
    });

    it('HUMAN ADMIN RESOLUTION: Admin orders revision and resets task to IN_PROGRESS', async () => {
      const disputeRes = await request(app)
        .post(`/api/tasks/${task._id}/disputes`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          reason: 'Minor styling mismatch'
        });

      const disputeId = disputeRes.body.data.id || disputeRes.body.data._id;

      const resolveRes = await request(app)
        .post(`/api/disputes/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          verdict: DisputeStatus.REVISION_ORDERED,
          explanation: 'Contractor must fix CSS and rerun tests before resubmission.',
          processRefund: false
        });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.status).toBe(DisputeStatus.REVISION_ORDERED);

      // Verify task status reset to IN_PROGRESS
      const updatedTask = await TaskModel.findById(task._id);
      expect(updatedTask?.status).toBe(TaskStatus.IN_PROGRESS);
    });
  });
});
