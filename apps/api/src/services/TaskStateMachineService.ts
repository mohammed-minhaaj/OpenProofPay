import { TaskStatus, AuditAction, UserRole } from '@openproofpay/shared';
import { TaskModel, ITaskDocument } from '../models/Task.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { AppError } from '../errors/AppError.js';
import mongoose from 'mongoose';

/**
 * Strict transition map defining legal transitions from each state
 */
export const VALID_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.CREATED]: [TaskStatus.OPEN, TaskStatus.CLAIMED, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.CLOSED],
  [TaskStatus.OPEN]: [TaskStatus.CLAIMED, TaskStatus.ASSIGNED, TaskStatus.CLOSED],
  [TaskStatus.CLAIMED]: [TaskStatus.SUBMITTED, TaskStatus.OPEN, TaskStatus.CLOSED],
  [TaskStatus.ASSIGNED]: [TaskStatus.IN_PROGRESS, TaskStatus.CLAIMED, TaskStatus.SUBMITTED, TaskStatus.CREATED, TaskStatus.CLOSED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.SUBMITTED, TaskStatus.CLAIMED, TaskStatus.ASSIGNED, TaskStatus.CLOSED, TaskStatus.DISPUTED],
  [TaskStatus.SUBMITTED]: [
    TaskStatus.VERIFYING,
    TaskStatus.CLAIMED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.AWAITING_REVIEW,
    TaskStatus.AWAITING_EMPLOYER_APPROVAL,
    TaskStatus.REVISION_REQUESTED,
    TaskStatus.REJECTED,
    TaskStatus.DISPUTED
  ],
  [TaskStatus.VERIFYING]: [
    TaskStatus.AWAITING_REVIEW,
    TaskStatus.VERIFICATION_PASSED,
    TaskStatus.VERIFICATION_FAILED,
    TaskStatus.REVISION_REQUESTED,
    TaskStatus.REJECTED,
    TaskStatus.DISPUTED
  ],
  [TaskStatus.VERIFICATION_FAILED]: [TaskStatus.AWAITING_REVIEW, TaskStatus.REVISION_REQUESTED, TaskStatus.IN_PROGRESS, TaskStatus.CLOSED, TaskStatus.DISPUTED],
  [TaskStatus.VERIFICATION_PASSED]: [TaskStatus.AWAITING_REVIEW, TaskStatus.AWAITING_EMPLOYER_APPROVAL, TaskStatus.DISPUTED],
  [TaskStatus.AWAITING_REVIEW]: [
    TaskStatus.APPROVED,
    TaskStatus.REJECTED,
    TaskStatus.REVISION_REQUESTED,
    TaskStatus.VERIFYING,
    TaskStatus.DISPUTED
  ],
  [TaskStatus.AWAITING_EMPLOYER_APPROVAL]: [
    TaskStatus.APPROVED,
    TaskStatus.REJECTED,
    TaskStatus.REVISION_REQUESTED,
    TaskStatus.AWAITING_REVIEW,
    TaskStatus.DISPUTED
  ],
  [TaskStatus.REVISION_REQUESTED]: [TaskStatus.SUBMITTED, TaskStatus.CLAIMED, TaskStatus.IN_PROGRESS, TaskStatus.CLOSED, TaskStatus.DISPUTED],
  [TaskStatus.REJECTED]: [TaskStatus.CLOSED, TaskStatus.OPEN, TaskStatus.REVISION_REQUESTED, TaskStatus.DISPUTED],
  [TaskStatus.APPROVED]: [
    TaskStatus.PAYMENT_PENDING,
    TaskStatus.PAID,
    TaskStatus.PAYMENT_PROCESSING,
    TaskStatus.PAYMENT_COMPLETED,
    TaskStatus.DISPUTED
  ],
  [TaskStatus.PAYMENT_PENDING]: [TaskStatus.PAID, TaskStatus.PAYMENT_COMPLETED, TaskStatus.PAYMENT_FAILED, TaskStatus.AWAITING_REVIEW],
  [TaskStatus.PAYMENT_PROCESSING]: [TaskStatus.PAID, TaskStatus.PAYMENT_COMPLETED, TaskStatus.PAYMENT_FAILED],
  [TaskStatus.PAYMENT_FAILED]: [TaskStatus.PAYMENT_PENDING, TaskStatus.PAYMENT_PROCESSING, TaskStatus.AWAITING_REVIEW, TaskStatus.AWAITING_EMPLOYER_APPROVAL, TaskStatus.DISPUTED],
  [TaskStatus.PAID]: [TaskStatus.CLOSED],
  [TaskStatus.PAYMENT_COMPLETED]: [TaskStatus.CLOSED],
  [TaskStatus.DISPUTED]: [TaskStatus.IN_PROGRESS, TaskStatus.CLOSED, TaskStatus.APPROVED],
  [TaskStatus.CLOSED]: [] // Terminal state
};

export interface StateTransitionContext {
  taskId: string;
  targetStatus: TaskStatus;
  actorId?: string;
  actorRole?: UserRole | string;
  ipAddress?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export class TaskStateMachineService {
  /**
   * Check if a transition is valid according to the state machine
   */
  static isValidTransition(currentStatus: TaskStatus, targetStatus: TaskStatus): boolean {
    const allowed = VALID_TASK_TRANSITIONS[currentStatus];
    return allowed ? allowed.includes(targetStatus) : false;
  }

  /**
   * Transition a task to a target status with validation and audit logging
   */
  static async transition(ctx: StateTransitionContext): Promise<ITaskDocument> {
    const { taskId, targetStatus, actorId, actorRole, ipAddress, reason, metadata } = ctx;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      throw AppError.badRequest('Invalid Task ID format');
    }

    const task = await TaskModel.findById(taskId);
    if (!task) {
      throw AppError.notFound(`Task with ID ${taskId} not found`);
    }

    const currentStatus = task.status;

    // Reject self-transition or invalid transition
    if (currentStatus === targetStatus) {
      return task;
    }

    if (!this.isValidTransition(currentStatus, targetStatus)) {
      throw AppError.badRequest(
        `Invalid task state transition: Cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed target states: [${(VALID_TASK_TRANSITIONS[currentStatus] || []).join(', ')}]`,
        'INVALID_STATE_TRANSITION',
        {
          currentStatus,
          targetStatus,
          allowedTransitions: VALID_TASK_TRANSITIONS[currentStatus] || []
        }
      );
    }

    // Role-specific authorization checks for critical transitions
    if (targetStatus === TaskStatus.APPROVED) {
      if (actorRole !== UserRole.EMPLOYER && actorRole !== UserRole.ADMIN) {
        throw AppError.forbidden('Only an Employer or Admin can approve milestone completion');
      }
      if (actorId && task.employerId.toString() !== actorId && actorRole !== UserRole.ADMIN) {
        throw AppError.forbidden('Only the employer owning this task can approve it');
      }
    }

    if (targetStatus === TaskStatus.REJECTED) {
      if (actorRole && actorRole !== UserRole.EMPLOYER && actorRole !== UserRole.ADMIN) {
        throw AppError.forbidden('Only an Employer or Admin can reject a milestone');
      }
      if (actorId && task.employerId.toString() !== actorId && actorRole !== UserRole.ADMIN) {
        throw AppError.forbidden('Only the employer owning this task can reject it');
      }
    }

    if (targetStatus === TaskStatus.IN_PROGRESS && actorRole === UserRole.DEVELOPER) {
      if (task.assignedDeveloperId && actorId && task.assignedDeveloperId.toString() !== actorId) {
        throw AppError.forbidden('Only the assigned developer can start working on this task');
      }
    }

    // Apply mutation
    task.status = targetStatus;
    await task.save();

    // Map audit action
    let auditAction = AuditAction.TASK_ASSIGNED;
    if (targetStatus === TaskStatus.SUBMITTED) auditAction = AuditAction.PR_SUBMITTED;
    else if (targetStatus === TaskStatus.APPROVED) auditAction = AuditAction.TASK_APPROVED;
    else if (targetStatus === TaskStatus.REVISION_REQUESTED) auditAction = AuditAction.TASK_REVISION_REQUESTED;
    else if (targetStatus === TaskStatus.REJECTED) auditAction = AuditAction.TASK_REJECTED;

    // Immutable audit record
    await AuditLogModel.create({
      actorId: actorId ? new mongoose.Types.ObjectId(actorId) : undefined,
      actorRole,
      action: auditAction,
      resourceType: 'Task',
      resourceId: task._id.toString(),
      ipAddress,
      metadata: {
        previousStatus: currentStatus,
        newStatus: targetStatus,
        reason,
        ...metadata
      }
    });

    return task;
  }
}
