import mongoose from 'mongoose';
import { DisputeModel, IDisputeDocument } from '../../models/Dispute.js';
import { TaskModel } from '../../models/Task.js';
import { PaymentModel } from '../../models/Payment.js';
import { PaymentEventModel } from '../../models/PaymentEvent.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { NotificationService } from '../notifications/notifications.service.js';
import { PayPalClient } from '../payments/PayPalClient.js';
import { formatPayPalAmount } from '../payments/interfaces.js';
import {
  DisputeStatus,
  UserRole,
  NotificationType,
  AuditAction,
  PaymentStatus,
  TaskStatus
} from '@openproofpay/shared';
import { AppError } from '../../errors/AppError.js';

export interface CreateDisputeInput {
  reason: string;
  evidenceSummary?: string;
  attachments?: Array<{ title: string; url?: string; commitSha?: string; type?: string }>;
}

export interface AddDisputeMessageInput {
  message: string;
  attachments?: Array<{ title: string; url?: string; commitSha?: string }>;
}

export interface ResolveDisputeInput {
  verdict: DisputeStatus;
  explanation: string;
  processRefund?: boolean;
}

export class DisputesService {
  /**
   * Raise a human-governed dispute on a milestone task
   */
  static async createDispute(
    taskId: string,
    userId: string,
    userRole: UserRole,
    input: CreateDisputeInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<IDisputeDocument> {
    const task = await TaskModel.findById(taskId);
    if (!task) {
      throw AppError.notFound(`Milestone task '${taskId}' not found`);
    }

    const isEmployer = task.employerId.toString() === userId;
    const isDeveloper = task.assignedDeveloperId?.toString() === userId;

    if (!isEmployer && !isDeveloper && userRole !== UserRole.ADMIN) {
      throw AppError.forbidden(
        'Forbidden: Only the task employer or assigned developer can raise a dispute',
        'NOT_TASK_PARTICIPANT'
      );
    }

    // Determine respondent
    let respondentId: mongoose.Types.ObjectId;
    if (isEmployer) {
      if (!task.assignedDeveloperId) {
        throw AppError.badRequest('Cannot raise dispute on an unassigned task');
      }
      respondentId = task.assignedDeveloperId;
    } else {
      respondentId = task.employerId;
    }

    // Check if an open dispute already exists on this task
    const existing = await DisputeModel.findOne({
      taskId: task._id,
      status: { $in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] }
    });
    if (existing) {
      throw AppError.conflict(
        `An active dispute (${existing._id}) is already open for this task`,
        'DISPUTE_ALREADY_OPEN'
      );
    }

    const dispute = await DisputeModel.create({
      taskId: task._id,
      projectId: task.projectId,
      initiatorId: new mongoose.Types.ObjectId(userId),
      initiatorRole: userRole,
      respondentId,
      reason: input.reason,
      evidenceSummary: input.evidenceSummary,
      attachments: input.attachments || [],
      status: DisputeStatus.OPEN,
      messages: []
    });

    // Freeze task status to DISPUTED
    task.status = TaskStatus.DISPUTED;
    await task.save();

    // Record immutable audit log
    await AuditLogModel.create({
      actorId: new mongoose.Types.ObjectId(userId),
      actorRole: userRole,
      action: AuditAction.DISPUTE_RAISED,
      resourceType: 'Dispute',
      resourceId: dispute._id.toString(),
      ipAddress,
      userAgent,
      metadata: { taskId: task._id.toString(), reason: input.reason }
    });

    // Dispatch real-time notification to respondent
    await NotificationService.sendNotification({
      recipientId: respondentId,
      type: NotificationType.DISPUTE_UPDATED,
      title: 'Dispute Raised on Milestone Deliverable',
      message: `A dispute has been raised on task '${task.title}': ${input.reason.substring(0, 100)}`,
      resourceType: 'Dispute',
      resourceId: dispute._id
    });

    return dispute;
  }

  /**
   * Post counter-evidence or dialogue message in dispute
   */
  static async addMessage(
    disputeId: string,
    userId: string,
    userRole: UserRole,
    input: AddDisputeMessageInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<IDisputeDocument> {
    const dispute = await DisputeModel.findById(disputeId);
    if (!dispute) {
      throw AppError.notFound(`Dispute '${disputeId}' not found`);
    }

    const isInitiator = dispute.initiatorId.toString() === userId;
    const isRespondent = dispute.respondentId.toString() === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isInitiator && !isRespondent && !isAdmin) {
      throw AppError.forbidden('Forbidden: You are not a participant in this dispute', 'NOT_DISPUTE_PARTICIPANT');
    }

    if (
      dispute.status === DisputeStatus.RESOLVED_FOR_EMPLOYER ||
      dispute.status === DisputeStatus.RESOLVED_FOR_DEVELOPER ||
      dispute.status === DisputeStatus.REVISION_ORDERED ||
      dispute.status === DisputeStatus.CANCELLED
    ) {
      throw AppError.badRequest(`Cannot post messages to a closed dispute (${dispute.status})`);
    }

    dispute.messages.push({
      senderId: new mongoose.Types.ObjectId(userId),
      senderRole: userRole,
      message: input.message,
      attachments: input.attachments,
      createdAt: new Date()
    });

    if (dispute.status === DisputeStatus.OPEN && isRespondent) {
      dispute.status = DisputeStatus.UNDER_REVIEW;
    }

    await dispute.save();

    // Immutable audit log
    await AuditLogModel.create({
      actorId: new mongoose.Types.ObjectId(userId),
      actorRole: userRole,
      action: AuditAction.DISPUTE_MESSAGE_ADDED,
      resourceType: 'Dispute',
      resourceId: dispute._id.toString(),
      ipAddress,
      userAgent,
      metadata: { messageLength: input.message.length }
    });

    // Notify other participant
    const otherParticipantId = isInitiator ? dispute.respondentId : dispute.initiatorId;
    await NotificationService.sendNotification({
      recipientId: otherParticipantId,
      type: NotificationType.DISPUTE_UPDATED,
      title: 'New Response on Dispute',
      message: `New message posted in dispute for task: ${input.message.substring(0, 100)}`,
      resourceType: 'Dispute',
      resourceId: dispute._id
    });

    return dispute;
  }

  /**
   * Official Human Admin Dispute Resolution (Guarantees zero AI auto-reversal of funds)
   */
  static async resolveDispute(
    disputeId: string,
    adminUserId: string,
    adminRole: UserRole,
    input: ResolveDisputeInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<IDisputeDocument> {
    // Hard Security Rule: ONLY human ADMIN can resolve disputes
    if (adminRole !== UserRole.ADMIN) {
      throw AppError.forbidden(
        'Security Policy Violation: Disputes can only be resolved by an authenticated human administrator.',
        'ADMIN_REQUIRED'
      );
    }

    const dispute = await DisputeModel.findById(disputeId);
    if (!dispute) {
      throw AppError.notFound(`Dispute '${disputeId}' not found`);
    }

    const validVerdicts = [
      DisputeStatus.RESOLVED_FOR_EMPLOYER,
      DisputeStatus.RESOLVED_FOR_DEVELOPER,
      DisputeStatus.REVISION_ORDERED,
      DisputeStatus.CANCELLED
    ];

    if (!validVerdicts.includes(input.verdict)) {
      throw AppError.badRequest(`Invalid resolution verdict '${input.verdict}'`);
    }

    let refundTransactionId: string | undefined;
    let refundAmount: number | undefined;

    // Handle PayPal refund if resolved for employer and payment was captured
    if (input.verdict === DisputeStatus.RESOLVED_FOR_EMPLOYER && input.processRefund) {
      const payment = await PaymentModel.findOne({ taskId: dispute.taskId });
      if (payment && payment.status === PaymentStatus.CAPTURED && payment.paypalCaptureId) {
        const amountObj = formatPayPalAmount(payment.amount, payment.currency);
        const refundRes = await PayPalClient.refundCapture(
          payment.paypalCaptureId,
          amountObj,
          `OpenProofPay Dispute Resolution (${dispute._id}): Resolved in favor of employer`
        );

        refundTransactionId = refundRes.id;
        refundAmount = payment.amount;

        // Transition Payment state to REFUNDED
        payment.status = PaymentStatus.REFUNDED;
        await payment.save();

        // Append immutable PaymentEvent
        await PaymentEventModel.create({
          paymentId: payment._id,
          eventType: 'PAYMENT_CAPTURE_REFUNDED',
          previousStatus: PaymentStatus.CAPTURED,
          newStatus: PaymentStatus.REFUNDED,
          rawPayloadSummary: {
            disputeId: dispute._id.toString(),
            refundTransactionId,
            adminUserId,
            explanation: input.explanation
          }
        });
      }
    }

    dispute.status = input.verdict;
    dispute.resolution = {
      resolvedBy: new mongoose.Types.ObjectId(adminUserId),
      verdict: input.verdict,
      explanation: input.explanation,
      refundTransactionId,
      refundAmount,
      resolvedAt: new Date()
    };

    await dispute.save();

    // Update task lifecycle status according to admin verdict
    if (input.verdict === DisputeStatus.REVISION_ORDERED) {
      await TaskModel.findByIdAndUpdate(dispute.taskId, { status: TaskStatus.IN_PROGRESS });
    } else if (input.verdict === DisputeStatus.RESOLVED_FOR_EMPLOYER) {
      await TaskModel.findByIdAndUpdate(dispute.taskId, { status: TaskStatus.CLOSED });
    } else if (input.verdict === DisputeStatus.RESOLVED_FOR_DEVELOPER) {
      await TaskModel.findByIdAndUpdate(dispute.taskId, { status: TaskStatus.APPROVED });
    }

    // Immutable Audit Log
    await AuditLogModel.create({
      actorId: new mongoose.Types.ObjectId(adminUserId),
      actorRole: adminRole,
      action: AuditAction.DISPUTE_RESOLVED,
      resourceType: 'Dispute',
      resourceId: dispute._id.toString(),
      ipAddress,
      userAgent,
      metadata: {
        verdict: input.verdict,
        refundTransactionId,
        explanation: input.explanation
      }
    });

    // Notify both participants
    const noticePayload = {
      type: NotificationType.DISPUTE_UPDATED,
      title: 'Dispute Officially Resolved by Administrator',
      message: `Resolution: ${input.verdict}. Explanation: ${input.explanation}`,
      resourceType: 'Dispute' as const,
      resourceId: dispute._id
    };

    await Promise.allSettled([
      NotificationService.sendNotification({ ...noticePayload, recipientId: dispute.initiatorId }),
      NotificationService.sendNotification({ ...noticePayload, recipientId: dispute.respondentId })
    ]);

    return dispute;
  }

  /**
   * List disputes for user (scoped by role & participation)
   */
  static async listUserDisputes(userId: string, userRole: UserRole) {
    let query: any = {};
    if (userRole !== UserRole.ADMIN) {
      const userObjId = new mongoose.Types.ObjectId(userId);
      query = {
        $or: [{ initiatorId: userObjId }, { respondentId: userObjId }]
      };
    }

    return DisputeModel.find(query)
      .populate('taskId', 'title paymentAmount bountyAmount status')
      .populate('initiatorId', 'name email role')
      .populate('respondentId', 'name email role')
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Get dispute details with Anti-IDOR validation
   */
  static async getDisputeById(disputeId: string, userId: string, userRole: UserRole) {
    const dispute = await DisputeModel.findById(disputeId)
      .populate('taskId')
      .populate('initiatorId', 'name email role')
      .populate('respondentId', 'name email role')
      .lean();

    if (!dispute) {
      throw AppError.notFound(`Dispute '${disputeId}' not found`);
    }

    const isParticipant =
      dispute.initiatorId._id.toString() === userId ||
      dispute.respondentId._id.toString() === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isParticipant && !isAdmin) {
      throw AppError.forbidden('Forbidden: You do not have permission to view this dispute', 'FORBIDDEN_DISPUTE');
    }

    return dispute;
  }
}
