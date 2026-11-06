import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { setupTestDb, clearTestDb, teardownTestDb } from '../test/setup.js';
import { TaskModel } from '../models/Task.js';
import { ProjectModel } from '../models/Project.js';
import { UserModel } from '../models/User.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { TaskStateMachineService } from './TaskStateMachineService.js';
import { TaskStatus, UserRole, ProjectStatus } from '@openproofpay/shared';
import { AppError } from '../errors/AppError.js';

describe('TaskStateMachineService Integration Tests', () => {
  let employerId: mongoose.Types.ObjectId;
  let developerId: mongoose.Types.ObjectId;
  let projectId: mongoose.Types.ObjectId;
  let taskId: string;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // Setup Employer & Developer
    const employer = await UserModel.create({
      email: 'employer@test.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Test Employer',
      role: UserRole.EMPLOYER
    });
    employerId = employer._id;

    const dev = await UserModel.create({
      email: 'dev@test.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Test Developer',
      role: UserRole.DEVELOPER
    });
    developerId = dev._id;

    const project = await ProjectModel.create({
      ownerId: employerId,
      name: 'Payment Proof Monorepo',
      status: ProjectStatus.ACTIVE,
      currency: 'USD'
    });
    projectId = project._id;

    const task = await TaskModel.create({
      projectId,
      employerId,
      title: 'Implement Webhook Security',
      description: 'HMAC signature verification for PayPal & GitHub webhooks',
      paymentAmount: 150.0,
      currency: 'USD',
      status: TaskStatus.CREATED
    });
    taskId = task._id.toString();
  });

  it('allows valid sequential lifecycle transitions', async () => {
    // 1. CREATED -> ASSIGNED
    let updated = await TaskStateMachineService.transition({
      taskId,
      targetStatus: TaskStatus.ASSIGNED,
      actorId: employerId.toString(),
      actorRole: UserRole.EMPLOYER
    });
    expect(updated.status).toBe(TaskStatus.ASSIGNED);

    // 2. ASSIGNED -> IN_PROGRESS
    updated = await TaskStateMachineService.transition({
      taskId,
      targetStatus: TaskStatus.IN_PROGRESS,
      actorId: developerId.toString(),
      actorRole: UserRole.DEVELOPER
    });
    expect(updated.status).toBe(TaskStatus.IN_PROGRESS);

    // 3. IN_PROGRESS -> SUBMITTED
    updated = await TaskStateMachineService.transition({
      taskId,
      targetStatus: TaskStatus.SUBMITTED,
      actorId: developerId.toString(),
      actorRole: UserRole.DEVELOPER
    });
    expect(updated.status).toBe(TaskStatus.SUBMITTED);

    // 4. SUBMITTED -> VERIFYING
    updated = await TaskStateMachineService.transition({
      taskId,
      targetStatus: TaskStatus.VERIFYING
    });
    expect(updated.status).toBe(TaskStatus.VERIFYING);

    // 5. VERIFYING -> VERIFICATION_PASSED
    updated = await TaskStateMachineService.transition({
      taskId,
      targetStatus: TaskStatus.VERIFICATION_PASSED
    });
    expect(updated.status).toBe(TaskStatus.VERIFICATION_PASSED);

    // 6. VERIFICATION_PASSED -> AWAITING_EMPLOYER_APPROVAL
    updated = await TaskStateMachineService.transition({
      taskId,
      targetStatus: TaskStatus.AWAITING_EMPLOYER_APPROVAL
    });
    expect(updated.status).toBe(TaskStatus.AWAITING_EMPLOYER_APPROVAL);

    // 7. AWAITING_EMPLOYER_APPROVAL -> APPROVED (Explicit Employer Human Action)
    updated = await TaskStateMachineService.transition({
      taskId,
      targetStatus: TaskStatus.APPROVED,
      actorId: employerId.toString(),
      actorRole: UserRole.EMPLOYER
    });
    expect(updated.status).toBe(TaskStatus.APPROVED);

    // 8. APPROVED -> PAYMENT_PROCESSING
    updated = await TaskStateMachineService.transition({
      taskId,
      targetStatus: TaskStatus.PAYMENT_PROCESSING
    });
    expect(updated.status).toBe(TaskStatus.PAYMENT_PROCESSING);

    // 9. PAYMENT_PROCESSING -> PAYMENT_COMPLETED
    updated = await TaskStateMachineService.transition({
      taskId,
      targetStatus: TaskStatus.PAYMENT_COMPLETED
    });
    expect(updated.status).toBe(TaskStatus.PAYMENT_COMPLETED);

    // Verify AuditLog entries were persisted for each transition
    const logs = await AuditLogModel.find({ resourceId: taskId });
    expect(logs.length).toBe(9);
  });

  it('strictly rejects illegal arbitrary state jumping (Rule 12)', async () => {
    // Attempting to jump directly from CREATED to APPROVED must fail
    await expect(
      TaskStateMachineService.transition({
        taskId,
        targetStatus: TaskStatus.APPROVED,
        actorId: employerId.toString(),
        actorRole: UserRole.EMPLOYER
      })
    ).rejects.toThrowError(AppError);

    // Attempting to jump from CREATED directly to PAYMENT_COMPLETED must fail
    await expect(
      TaskStateMachineService.transition({
        taskId,
        targetStatus: TaskStatus.PAYMENT_COMPLETED
      })
    ).rejects.toThrowError('Invalid task state transition');

    // Confirm state has not changed
    const task = await TaskModel.findById(taskId);
    expect(task?.status).toBe(TaskStatus.CREATED);
  });

  it('rejects milestone approval if actor is DEVELOPER instead of EMPLOYER (Rule 13)', async () => {
    // Advance task to AWAITING_EMPLOYER_APPROVAL
    await TaskModel.findByIdAndUpdate(taskId, { status: TaskStatus.AWAITING_EMPLOYER_APPROVAL });

    // Developer attempts to approve their own task
    await expect(
      TaskStateMachineService.transition({
        taskId,
        targetStatus: TaskStatus.APPROVED,
        actorId: developerId.toString(),
        actorRole: UserRole.DEVELOPER
      })
    ).rejects.toThrowError('Only an Employer or Admin can approve milestone completion');

    // Confirm task remains in AWAITING_EMPLOYER_APPROVAL
    const task = await TaskModel.findById(taskId);
    expect(task?.status).toBe(TaskStatus.AWAITING_EMPLOYER_APPROVAL);
  });
});
