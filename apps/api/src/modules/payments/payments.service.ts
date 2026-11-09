import { PaymentModel, IPaymentDocument } from '../../models/Payment.js';
import { PaymentEventModel } from '../../models/PaymentEvent.js';
import { TaskModel } from '../../models/Task.js';
import { UserModel } from '../../models/User.js';
import { NotificationService } from '../notifications/notifications.service.js';
import { PayPalClient } from './PayPalClient.js';
import { PaymentGuardService } from './PaymentGuardService.js';
import { PaymentStateMachine } from './PaymentStateMachine.js';
import { TaskStateMachineService } from '../../services/TaskStateMachineService.js';
import { AppError } from '../../errors/AppError.js';
import { env } from '../../config/env.js';
import {
  PaymentStatus,
  TaskStatus,
  UserRole,
  NotificationType
} from '@openproofpay/shared';
import {
  CreateOrderInput,
  PaymentDetailsDTO,
  formatPayPalAmount,
  generatePayPalRequestId
} from './interfaces.js';

export class PaymentsService {
  /**
   * Create PayPal Order v2 for a milestone task with server-validated bounty amount
   */
  static async createTaskOrder(
    input: CreateOrderInput,
    employerId: string
  ): Promise<{ payment: IPaymentDocument; order: any }> {
    const { taskId, intent = 'AUTHORIZE' } = input;

    // 1. Verify Task exists and caller is employer
    const task = await TaskModel.findById(taskId);
    if (!task) {
      throw AppError.notFound(`Milestone task '${taskId}' not found`);
    }

    if (task.employerId.toString() !== employerId) {
      throw AppError.forbidden('Only the employer of this task can create or fund milestone orders');
    }

    // 2. Check existing payment record
    let payment = await PaymentModel.findOne({ taskId: task._id });
    if (payment) {
      if (payment.status === PaymentStatus.CAPTURED || payment.status === PaymentStatus.PAID_OUT) {
        throw AppError.conflict('Payment for this milestone has already been captured and completed');
      }
      if (payment.status === PaymentStatus.AUTHORIZED && payment.paypalAuthorizationId) {
        return { payment, order: { id: payment.paypalOrderId, status: 'COMPLETED' } };
      }
    }

    // 3. Server-validated financial amount and currency (APIMatic ISO-4217 schema conformance)
    const amountObj = formatPayPalAmount(task.paymentAmount, task.currency || 'USD');
    const idempotencyKey = generatePayPalRequestId(`ord-${task._id}`);

    // 4. Create PayPal Order v2
    const orderPayload = {
      intent,
      purchase_units: [
        {
          reference_id: `task-${task._id}`,
          description: `OpenProofPay Milestone Bounty: ${task.title.substring(0, 50)}`,
          custom_id: task._id.toString(),
          amount: amountObj
        }
      ],
      application_context: {
        brand_name: 'OpenProofPay Proof-to-Pay',
        user_action: 'CONTINUE' as const,
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl
      }
    };

    const order = await PayPalClient.createOrder(orderPayload, idempotencyKey);

    // 5. Create or update PaymentModel
    let targetPayment: IPaymentDocument;
    if (!payment) {
      targetPayment = await PaymentModel.create({
        taskId: task._id,
        projectId: task.projectId,
        employerId: task.employerId,
        developerId: task.assignedDeveloperId,
        amount: task.paymentAmount,
        currency: amountObj.currency_code,
        status: PaymentStatus.CREATED,
        paypalOrderId: order.id,
        idempotencyKey
      });
    } else {
      payment.paypalOrderId = order.id;
      payment.idempotencyKey = idempotencyKey;
      payment.amount = task.paymentAmount;
      payment.currency = amountObj.currency_code;
      payment.status = PaymentStatus.CREATED;
      await payment.save();
      targetPayment = payment;
    }

    // Advance to APPROVAL_PENDING (awaiting employer checkout interaction)
    const finalizedPayment = await PaymentStateMachine.transition({
      payment: targetPayment,
      targetStatus: PaymentStatus.APPROVAL_PENDING,
      actorId: employerId,
      eventType: 'CHECKOUT_ORDER_CREATED',
      rawPayloadSummary: { orderId: order.id, intent, amount: amountObj.value }
    });

    if (task.assignedDeveloperId) {
      NotificationService.sendNotification({
        recipientId: task.assignedDeveloperId,
        type: NotificationType.PAYMENT_INITIATED,
        title: 'Escrow Payment Initiated',
        message: `Employer initiated payment of $${amountObj.value} ${task.currency} for '${task.title}'.`,
        resourceType: 'Payment',
        resourceId: finalizedPayment._id
      }).catch(() => {});
    }

    return { payment: finalizedPayment, order };
  }

  /**
   * Authorize an approved order after employer completes PayPal Checkout modal
   */
  static async recordAuthorization(
    orderId: string,
    actorId: string,
    simulateInDev = false
  ): Promise<IPaymentDocument> {
    const payment = await PaymentModel.findOne({ paypalOrderId: orderId });
    if (!payment) {
      throw AppError.notFound(`Payment record for PayPal order '${orderId}' not found`);
    }

    if (payment.status === PaymentStatus.AUTHORIZED && payment.paypalAuthorizationId) {
      return payment;
    }

    let authId = `AUTH-${orderId}`;
    const isSandboxOrDev = env.NODE_ENV === 'development' || env.PAYPAL_MODE === 'sandbox';
    if (simulateInDev && isSandboxOrDev) {
      authId = `AUTH-SANDBOX-${Date.now()}`;
    } else {
      try {
        const idempotencyKey = generatePayPalRequestId(`auth-${payment._id}`);
        const orderRes = await PayPalClient.authorizeOrder(orderId, idempotencyKey);

        authId =
          orderRes.purchase_units?.[0]?.payments?.authorizations?.[0]?.id ||
          `AUTH-${orderId}`;
      } catch (err: any) {
        const isSandboxOrDev = env.NODE_ENV === 'development' || env.PAYPAL_MODE === 'sandbox';
        if (simulateInDev && isSandboxOrDev) {
          authId = `AUTH-SANDBOX-${Date.now()}`;
        } else {
          throw err;
        }
      }
    }

    payment.paypalAuthorizationId = authId;
    payment.approvedAt = new Date();
    payment.approvedBy = payment.employerId;

    // Transition state machine to AUTHORIZED
    const updatedPayment = await PaymentStateMachine.transition({
      payment,
      targetStatus: PaymentStatus.AUTHORIZED,
      actorId,
      eventType: 'PAYMENT_AUTHORIZATION_RECORDED',
      rawPayloadSummary: { orderId, authorizationId: authId }
    });

    return updatedPayment;
  }

  /**
   * Proof-to-Pay Release: Captures authorized funds and disburses payout ONLY after verification gates are satisfied
   */
  static async releasePayment(
    taskId: string,
    employerId: string,
    actorRole?: string,
    ipAddress?: string
  ): Promise<IPaymentDocument> {
    // 1. Enforce the Proof-to-Pay Gate (Human approval, PR exists, AI report exists, container test exists)
    const { task, payment, submission } = await PaymentGuardService.validateReleasePrerequisites(
      taskId,
      employerId,
      actorRole
    );

    // 2. Double-Capture and Idempotency Protection (Strict 36-char schema compliance)
    const captureKey = generatePayPalRequestId(`cap-${payment._id}`);

    // Advance state machine to CAPTURE_PENDING
    let currentPayment = await PaymentStateMachine.transition({
      payment,
      targetStatus: PaymentStatus.CAPTURE_PENDING,
      actorId: employerId,
      eventType: 'PAYMENT_CAPTURE_REQUESTED',
      rawPayloadSummary: { taskId, submissionId: submission._id.toString() }
    });

    // 3. Execute PayPal Capture (APIMatic validated currency formatting)
    let captureResponse;
    const captureAmount = formatPayPalAmount(currentPayment.amount, currentPayment.currency);

    if (currentPayment.paypalAuthorizationId) {
      captureResponse = await PayPalClient.captureAuthorization(
        currentPayment.paypalAuthorizationId,
        captureAmount,
        captureKey
      );
    } else {
      captureResponse = await PayPalClient.captureOrder(
        currentPayment.paypalOrderId!,
        captureKey
      );
    }

    currentPayment.paypalCaptureId = captureResponse.id;

    // Advance state machine to CAPTURED
    currentPayment = await PaymentStateMachine.transition({
      payment: currentPayment,
      targetStatus: PaymentStatus.CAPTURED,
      actorId: employerId,
      eventType: 'PAYMENT_CAPTURE_COMPLETED',
      rawPayloadSummary: { captureId: captureResponse.id, status: captureResponse.status }
    });

    // 4. Developer Payout Execution (separate from capture)
    const developerId = task.assignedDeveloperId || submission.developerId;
    const developer = developerId
      ? await UserModel.findById(developerId)
      : null;

    if (!task.assignedDeveloperId && submission.developerId) {
      task.assignedDeveloperId = submission.developerId;
      await task.save().catch(() => {});
    }

    const receiverEmail =
      developer?.paypalEmail ||
      developer?.email ||
      (env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? 'developer-sandbox@openproofpay.local' : undefined);

    if (receiverEmail) {
      currentPayment.payoutStatus = 'PENDING';
      await currentPayment.save();

      try {
        currentPayment = await PaymentStateMachine.transition({
          payment: currentPayment,
          targetStatus: PaymentStatus.PAYOUT_PENDING,
          actorId: employerId,
          eventType: 'DEVELOPER_PAYOUT_REQUESTED'
        });

        const payoutKey = generatePayPalRequestId(`payout-${currentPayment._id}-0`);
        const payoutResponse = await PayPalClient.createPayout(
          {
            sender_batch_header: {
              sender_batch_id: payoutKey,
              email_subject: `OpenProofPay Milestone Bounty: ${task.title.substring(0, 40)}`
            },
            items: [
              {
                recipient_type: 'EMAIL',
                amount: {
                  value: captureAmount.value,
                  currency: captureAmount.currency_code
                },
                receiver: receiverEmail,
                note: `Bounty payment for approved PR #${submission.prNumber}`,
                sender_item_id: task._id.toString()
              }
            ]
          },
          payoutKey
        );

        currentPayment.paypalPayoutBatchId = payoutResponse.batch_header.payout_batch_id;
        currentPayment.payoutStatus = 'SUCCESS';
        currentPayment.payoutError = undefined;

        currentPayment = await PaymentStateMachine.transition({
          payment: currentPayment,
          targetStatus: PaymentStatus.PAID_OUT,
          actorId: employerId,
          eventType: 'DEVELOPER_PAYOUT_SUCCESS',
          rawPayloadSummary: { payoutBatchId: payoutResponse.batch_header.payout_batch_id }
        });
      } catch (payoutErr: any) {
        // PRESERVE CAPTURED STATUS: Capture was successful, but developer payout failed.
        // Record payout error and allow safe idempotent retry.
        console.warn(`[PaymentsService] Developer payout failed for milestone '${task.title}':`, payoutErr?.message);
        currentPayment.status = PaymentStatus.CAPTURED;
        currentPayment.payoutStatus = 'FAILED';
        currentPayment.payoutError = payoutErr?.message || 'Developer payout API call failed';
        await currentPayment.save();

        if (task.employerId) {
          NotificationService.sendNotification({
            recipientId: task.employerId,
            type: NotificationType.PAYMENT_FAILED,
            title: 'Developer Payout Failed (Bounty Captured)',
            message: `Bounty was successfully captured, but developer payout failed: ${payoutErr?.message}. You can retry the payout from the Payment Ledger.`,
            resourceType: 'Payment',
            resourceId: currentPayment._id
          }).catch(() => {});
        }
      }
    } else {
      currentPayment.payoutStatus = 'NOT_ATTEMPTED';
      currentPayment.payoutError = 'Developer has not configured a PayPal receiver email.';
      await currentPayment.save();
    }

    // 5. Update Task Lifecycle to PAYMENT_COMPLETED
    if (task.status === TaskStatus.APPROVED) {
      await TaskStateMachineService.transition({
        taskId: task._id.toString(),
        targetStatus: TaskStatus.PAYMENT_COMPLETED,
        actorId: employerId,
        actorRole: actorRole || UserRole.EMPLOYER,
        ipAddress,
        reason: 'Proof-to-Pay Gate verified and PayPal payment captured successfully'
      });
    }

    // 6. Notify Developer and Employer
    try {
      if (developer) {
        await NotificationService.sendNotification({
          recipientId: developer._id,
          type: NotificationType.PAYMENT_COMPLETED,
          title: 'Milestone Bounty Released! 💰',
          message: `Your payment of $${currentPayment.amount} ${currentPayment.currency} for '${task.title}' was approved and captured.`,
          resourceType: 'Payment',
          resourceId: currentPayment._id
        });
      }
      if (task.employerId) {
        await NotificationService.sendNotification({
          recipientId: task.employerId,
          type: NotificationType.PAYMENT_COMPLETED,
          title: 'Milestone Escrow Captured',
          message: `Milestone escrow payment of $${currentPayment.amount} ${currentPayment.currency} for '${task.title}' was captured successfully.`,
          resourceType: 'Payment',
          resourceId: currentPayment._id
        });
      }
    } catch {
      // Ignore notification error
    }

    return currentPayment;
  }

  /**
   * Cancel an order or authorization
   */
  static async cancelOrder(orderId: string, actorId: string): Promise<IPaymentDocument> {
    const payment = await PaymentModel.findOne({ paypalOrderId: orderId });
    if (!payment) {
      throw AppError.notFound(`Payment record for order '${orderId}' not found`);
    }

    const updatedPayment = await PaymentStateMachine.transition({
      payment,
      targetStatus: PaymentStatus.CANCELLED,
      actorId,
      eventType: 'PAYMENT_CANCELLED_BY_USER'
    });

    return updatedPayment;
  }

  /**
   * Get detailed payment information including immutable audit event trail
   */
  static async getPaymentDetails(taskId: string, userId: string): Promise<PaymentDetailsDTO> {
    const payment = await PaymentModel.findOne({ taskId });
    if (!payment) {
      throw AppError.notFound(`No payment configured for task '${taskId}'`);
    }

    // Ownership check (employer or assigned developer)
    const isEmployer = payment.employerId.toString() === userId;
    const isDeveloper = payment.developerId?.toString() === userId;
    if (!isEmployer && !isDeveloper) {
      throw AppError.forbidden('You do not have access to this payment record');
    }

    const events = await PaymentEventModel.find({ paymentId: payment._id }).sort({ createdAt: -1 });

    return {
      id: payment._id.toString(),
      taskId: payment.taskId.toString(),
      projectId: payment.projectId.toString(),
      employerId: payment.employerId.toString(),
      developerId: payment.developerId?.toString(),
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paypalOrderId: payment.paypalOrderId,
      paypalAuthorizationId: payment.paypalAuthorizationId,
      paypalCaptureId: payment.paypalCaptureId,
      paypalPayoutBatchId: payment.paypalPayoutBatchId,
      idempotencyKey: payment.idempotencyKey,
      approvedAt: payment.approvedAt?.toISOString(),
      createdAt: payment.createdAt.toISOString(),
      events: events.map((e) => ({
        id: e._id.toString(),
        eventType: e.eventType,
        previousStatus: e.previousStatus,
        newStatus: e.newStatus,
        createdAt: e.createdAt.toISOString()
      }))
    };
  }

  /**
   * Get payment history for authenticated user
   */
  static async getPaymentHistory(userId: string): Promise<IPaymentDocument[]> {
    return PaymentModel.find({
      $or: [{ employerId: userId }, { developerId: userId }]
    }).sort({ createdAt: -1 });
  }

  /**
   * Safe idempotent retry for failed developer payouts after successful bounty capture
   */
  static async retryPayout(
    taskId: string,
    employerId: string,
    _ipAddress?: string
  ): Promise<IPaymentDocument> {
    const payment = await PaymentModel.findOne({ taskId });
    if (!payment) {
      throw AppError.notFound(`Payment record for task '${taskId}' not found`);
    }

    if (payment.employerId.toString() !== employerId) {
      throw AppError.forbidden('Only the employer can retry developer payouts for this milestone');
    }

    if (payment.status !== PaymentStatus.CAPTURED && payment.status !== PaymentStatus.PAYOUT_PENDING) {
      if (payment.status === PaymentStatus.PAID_OUT) {
        throw AppError.conflict('Developer payout has already completed successfully');
      }
      throw AppError.badRequest(`Cannot retry payout from '${payment.status}' state. Funds must be captured first.`);
    }

    const task = await TaskModel.findById(taskId);
    if (!task) {
      throw AppError.notFound(`Milestone task '${taskId}' not found`);
    }

    const developer = task.assignedDeveloperId
      ? await UserModel.findById(task.assignedDeveloperId)
      : null;

    if (!developer?.paypalEmail) {
      throw AppError.badRequest('Developer has not configured a PayPal receiver email. Cannot execute payout.');
    }

    payment.payoutRetries = (payment.payoutRetries || 0) + 1;
    payment.payoutStatus = 'PENDING';
    await payment.save();

    const captureAmount = formatPayPalAmount(payment.amount, payment.currency);
    const payoutKey = generatePayPalRequestId(`payout-${payment._id}-${payment.payoutRetries}`);

    try {
      const payoutResponse = await PayPalClient.createPayout(
        {
          sender_batch_header: {
            sender_batch_id: payoutKey,
            email_subject: `OpenProofPay Milestone Bounty Payout: ${task.title.substring(0, 40)}`
          },
          items: [
            {
              recipient_type: 'EMAIL',
              amount: {
                value: captureAmount.value,
                currency: captureAmount.currency_code
              },
              receiver: developer.paypalEmail,
              note: `Milestone payout retry #${payment.payoutRetries} for task: ${task.title}`,
              sender_item_id: task._id.toString()
            }
          ]
        },
        payoutKey
      );

      payment.paypalPayoutBatchId = payoutResponse.batch_header.payout_batch_id;
      payment.payoutStatus = 'SUCCESS';
      payment.payoutError = undefined;

      const updated = await PaymentStateMachine.transition({
        payment,
        targetStatus: PaymentStatus.PAID_OUT,
        actorId: employerId,
        eventType: 'DEVELOPER_PAYOUT_SUCCESS',
        rawPayloadSummary: { payoutBatchId: payoutResponse.batch_header.payout_batch_id, retry: payment.payoutRetries }
      });

      return updated;
    } catch (payoutErr: any) {
      payment.payoutStatus = 'FAILED';
      payment.payoutError = payoutErr?.message || 'Payout retry failed';
      await payment.save();
      throw AppError.badRequest(`Developer payout retry failed: ${payoutErr?.message}`);
    }
  }
}
