import { IPaymentDocument } from '../../models/Payment.js';
import { PaymentEventModel } from '../../models/PaymentEvent.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { PaymentStatus, AuditAction } from '@openproofpay/shared';
import { AppError } from '../../errors/AppError.js';

export class PaymentStateMachine {
  /**
   * Allowed sequential lifecycle transitions for the 13-state machine
   */
  private static readonly VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
    [PaymentStatus.NOT_CONFIGURED]: [
      PaymentStatus.CREATED,
      PaymentStatus.APPROVAL_PENDING,
      PaymentStatus.FAILED
    ],
    [PaymentStatus.CREATED]: [
      PaymentStatus.APPROVAL_PENDING,
      PaymentStatus.AUTHORIZED,
      PaymentStatus.CANCELLED,
      PaymentStatus.FAILED
    ],
    [PaymentStatus.APPROVAL_PENDING]: [
      PaymentStatus.AUTHORIZED,
      PaymentStatus.AWAITING_VERIFICATION,
      PaymentStatus.AWAITING_EMPLOYER_APPROVAL,
      PaymentStatus.CANCELLED,
      PaymentStatus.FAILED
    ],
    [PaymentStatus.AUTHORIZED]: [
      PaymentStatus.AWAITING_VERIFICATION,
      PaymentStatus.AWAITING_EMPLOYER_APPROVAL,
      PaymentStatus.CAPTURE_PENDING,
      PaymentStatus.CAPTURED,
      PaymentStatus.CANCELLED,
      PaymentStatus.REFUNDED,
      PaymentStatus.FAILED
    ],
    [PaymentStatus.AWAITING_VERIFICATION]: [
      PaymentStatus.AWAITING_EMPLOYER_APPROVAL,
      PaymentStatus.AUTHORIZED,
      PaymentStatus.CANCELLED,
      PaymentStatus.FAILED
    ],
    [PaymentStatus.AWAITING_EMPLOYER_APPROVAL]: [
      PaymentStatus.CAPTURE_PENDING,
      PaymentStatus.CAPTURED,
      PaymentStatus.PAYOUT_PENDING,
      PaymentStatus.PAID_OUT,
      PaymentStatus.CANCELLED,
      PaymentStatus.FAILED
    ],
    [PaymentStatus.CAPTURE_PENDING]: [
      PaymentStatus.CAPTURED,
      PaymentStatus.PAYOUT_PENDING,
      PaymentStatus.PAID_OUT,
      PaymentStatus.FAILED
    ],
    [PaymentStatus.CAPTURED]: [
      PaymentStatus.PAYOUT_PENDING,
      PaymentStatus.PAID_OUT,
      PaymentStatus.PAYOUT_FAILED,
      PaymentStatus.REFUNDED
    ],
    [PaymentStatus.PAYOUT_PENDING]: [
      PaymentStatus.PAID_OUT,
      PaymentStatus.PAYOUT_FAILED,
      PaymentStatus.CAPTURED,
      PaymentStatus.FAILED
    ],
    [PaymentStatus.PAYOUT_FAILED]: [
      PaymentStatus.PAYOUT_PENDING,
      PaymentStatus.PAID_OUT,
      PaymentStatus.CAPTURED,
      PaymentStatus.REFUNDED
    ],
    [PaymentStatus.PAID_OUT]: [
      PaymentStatus.REFUNDED
    ],
    [PaymentStatus.FAILED]: [
      PaymentStatus.CREATED,
      PaymentStatus.APPROVAL_PENDING
    ],
    [PaymentStatus.CANCELLED]: [],
    [PaymentStatus.REFUNDED]: []
  };

  /**
   * Transition payment to next status with validation and immutable audit event
   */
  static async transition(params: {
    payment: IPaymentDocument;
    targetStatus: PaymentStatus;
    actorId?: string;
    eventType: string;
    paypalWebhookId?: string;
    rawPayloadSummary?: Record<string, unknown>;
  }): Promise<IPaymentDocument> {
    const { payment, targetStatus, actorId, eventType, paypalWebhookId, rawPayloadSummary } = params;
    const previousStatus = payment.status;

    // Idempotent: If already in target status, return existing payment without error
    if (previousStatus === targetStatus) {
      return payment;
    }

    const allowed = this.VALID_TRANSITIONS[previousStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw AppError.badRequest(
        `Illegal payment state transition: Cannot transition from '${previousStatus}' to '${targetStatus}'.`,
        'INVALID_PAYMENT_TRANSITION'
      );
    }

    payment.status = targetStatus;
    await payment.save();

    // 1. Record immutable PaymentEvent
    try {
      await PaymentEventModel.create({
        paymentId: payment._id,
        eventType,
        previousStatus,
        newStatus: targetStatus,
        paypalWebhookId,
        rawPayloadSummary
      });
    } catch {
      // Continue even if event audit log fails
    }

    // 2. Record system audit log
    try {
      let auditAction = AuditAction.PAYMENT_AUTHORIZED;
      if (targetStatus === PaymentStatus.CAPTURED) {
        auditAction = AuditAction.PAYMENT_CAPTURED;
      } else if (targetStatus === PaymentStatus.PAID_OUT) {
        auditAction = AuditAction.PAYMENT_PAID_OUT;
      }

      await AuditLogModel.create({
        action: auditAction,
        actorId: actorId || '000000000000000000000000',
        entityId: payment._id.toString(),
        entityType: 'Payment',
        details: {
          taskId: payment.taskId.toString(),
          amount: payment.amount,
          currency: payment.currency,
          previousStatus,
          newStatus: targetStatus,
          eventType
        },
        ipAddress: '127.0.0.1'
      });
    } catch {
      // Ignore audit failure
    }

    return payment;
  }
}
