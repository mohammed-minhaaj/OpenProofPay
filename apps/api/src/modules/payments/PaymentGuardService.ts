import { TaskModel, ITaskDocument } from '../../models/Task.js';
import { PaymentModel, IPaymentDocument } from '../../models/Payment.js';
import { PullRequestSubmissionModel, IPullRequestSubmissionDocument } from '../../models/PullRequestSubmission.js';
import { VerificationReportModel, IVerificationReportDocument } from '../../models/VerificationReport.js';
import { TestExecutionModel, ITestExecutionDocument } from '../../models/TestExecution.js';
import { TaskStatus, PaymentStatus, UserRole } from '@openproofpay/shared';
import { AppError } from '../../errors/AppError.js';

export interface ValidatedReleaseContext {
  task: ITaskDocument;
  payment: IPaymentDocument;
  submission: IPullRequestSubmissionDocument;
  verificationReport: IVerificationReportDocument;
  testExecution?: ITestExecutionDocument | null;
}

export class PaymentGuardService {
  /**
   * Enforce the Proof-to-Pay Gate before payment capture or developer payout
   * Guarantees that AI alone CANNOT disburse funds and that all verification & approval gates are satisfied
   */
  static async validateReleasePrerequisites(
    taskId: string,
    actorId: string,
    actorRole?: string
  ): Promise<ValidatedReleaseContext> {
    // 1. Fetch Task
    const task = await TaskModel.findById(taskId);
    if (!task) {
      throw AppError.notFound(`Milestone task '${taskId}' not found`);
    }

    // 2. Authorization & Ownership Gate (Anti-IDOR)
    const isEmployerOwner = task.employerId.toString() === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;

    if (!isEmployerOwner && !isAdmin) {
      throw AppError.forbidden(
        'Forbidden: Only the employer who posted this milestone can authorize payment release',
        'NOT_TASK_EMPLOYER'
      );
    }

    // 3. Payment Record & Double-Capture Gate (Anti-Double Spend)
    const payment = await PaymentModel.findOne({ taskId: task._id });
    if (!payment) {
      throw AppError.badRequest(
        'No PayPal payment or authorization configured for this milestone task',
        'PAYMENT_RECORD_MISSING'
      );
    }

    if (payment.status === PaymentStatus.CAPTURED || payment.status === PaymentStatus.PAID_OUT) {
      throw AppError.conflict(
        `Duplicate release blocked: Payment is already in '${payment.status}' state`,
        'PAYMENT_ALREADY_CAPTURED'
      );
    }

    // 4. Human Approval Gate: Task must be explicitly in APPROVED status
    if (task.status !== TaskStatus.APPROVED) {
      throw AppError.badRequest(
        `Proof-to-Pay Gate blocked: Milestone deliverable must be in 'APPROVED' status before release (current: ${task.status}). Human employer review is required.`,
        'TASK_NOT_APPROVED'
      );
    }

    // 5. Submission Gate: Must have an accepted or latest Pull Request Submission
    let submission: IPullRequestSubmissionDocument | null = null;
    if (task.acceptedSubmissionId) {
      submission = await PullRequestSubmissionModel.findById(task.acceptedSubmissionId);
    }
    if (!submission) {
      submission = await PullRequestSubmissionModel.findOne({ taskId: task._id }).sort({ createdAt: -1 });
    }

    if (!submission) {
      throw AppError.badRequest(
        'Proof-to-Pay Gate blocked: No valid Pull Request submission found for this milestone',
        'SUBMISSION_MISSING'
      );
    }

    // 6. AI Verification Proof Gate: VerificationReport must exist for submission
    const verificationReport = await VerificationReportModel.findOne({
      submissionId: submission._id
    }).sort({ createdAt: -1 });

    if (!verificationReport) {
      throw AppError.badRequest(
        'Proof-to-Pay Gate blocked: Autonomous AI Verification Report is missing for this submission',
        'VERIFICATION_REPORT_MISSING'
      );
    }

    // SHA and Freshness Integrity Gate (Rule 3.6 & 11)
    if (verificationReport.isOutdated) {
      throw AppError.badRequest(
        'Proof-to-Pay Gate blocked: Verification report is OUTDATED because newer commits exist on this PR.',
        'OUTDATED_REPORT'
      );
    }

    if (verificationReport.commitSha && submission.headSha && verificationReport.commitSha !== submission.headSha) {
      throw AppError.badRequest(
        `Proof-to-Pay Gate blocked: Verification report SHA (${verificationReport.commitSha.slice(0, 7)}) does not match current PR head SHA (${submission.headSha.slice(0, 7)}).`,
        'SHA_MISMATCH'
      );
    }

    // 7. Check if container test execution or CI results exist
    const testExecution = await TestExecutionModel.findOne({
      submissionId: submission._id
    }).sort({ createdAt: -1 });

    const hasCIEvaluation =
      verificationReport?.ciTestStatus === 'PASSED' ||
      verificationReport?.ciTestStatus === 'FAILED';

    if (!testExecution && !hasCIEvaluation) {
      throw AppError.badRequest(
        'Proof-to-Pay Gate blocked: Isolated container test execution record is missing for this submission',
        'TEST_EXECUTION_MISSING'
      );
    }

    // 8. Check valid capturable state
    const capturableStates: PaymentStatus[] = [
      PaymentStatus.AUTHORIZED,
      PaymentStatus.AWAITING_EMPLOYER_APPROVAL,
      PaymentStatus.AWAITING_VERIFICATION,
      PaymentStatus.CAPTURE_PENDING,
      PaymentStatus.APPROVAL_PENDING,
      PaymentStatus.CREATED
    ];

    if (!capturableStates.includes(payment.status)) {
      throw AppError.badRequest(
        `Cannot release payment: Current payment status is '${payment.status}'`,
        'INVALID_PAYMENT_STATE'
      );
    }

    return {
      task,
      payment,
      submission,
      verificationReport,
      testExecution
    };
  }
}
