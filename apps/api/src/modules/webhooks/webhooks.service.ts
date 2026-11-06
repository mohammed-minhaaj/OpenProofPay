import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { VerificationReportModel } from '../../models/VerificationReport.js';
import { TaskModel } from '../../models/Task.js';
import { ProjectModel } from '../../models/Project.js';
import { UserModel } from '../../models/User.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { PaymentModel } from '../../models/Payment.js';
import { PaymentEventModel } from '../../models/PaymentEvent.js';
import { WebhookJobModel } from '../../models/WebhookJob.js';
import { GitHubService } from '../../services/GitHubService.js';
import { AIVerificationService } from '../ai-verification/ai-verification.service.js';
import { NotificationService } from '../notifications/notifications.service.js';
import { TaskStateMachineService } from '../../services/TaskStateMachineService.js';
import {
  TaskStatus,
  AuditAction,
  PaymentStatus,
  SubmissionStatus,
  WebhookJobStatus,
  NotificationType
} from '@openproofpay/shared';

// In-memory cache for fast delivery ID deduplication before DB lookup
const processedDeliveries = new Set<string>();

export interface GitHubWebhookPayload {
  action?: string;
  repository?: {
    id: number;
    full_name: string;
    owner: { login: string };
    name: string;
  };
  pull_request?: {
    number: number;
    title: string;
    body?: string;
    state: string;
    merged?: boolean;
    head: { sha: string; ref: string };
    base: { ref: string };
    user: { login: string };
    html_url: string;
  };
  issue?: {
    number: number;
    title: string;
    body?: string;
    state: string;
  };
  check_run?: {
    id: number;
    head_sha: string;
    status: string;
    conclusion: string;
  };
}

export class WebhookService {
  /**
   * Persist incoming verified webhook event durably into the queue before acknowledging
   */
  static async enqueueGitHubWebhook(
    deliveryId: string,
    event: string,
    payload: GitHubWebhookPayload,
    ipAddress?: string
  ): Promise<{ status: string; duplicate?: boolean; jobId?: string }> {
    // 1. In-memory deduplication check
    if (processedDeliveries.has(deliveryId)) {
      return { status: 'IGNORED_DUPLICATE', duplicate: true };
    }

    // 2. Persistent deduplication check in WebhookJob collection
    const existingJob = await WebhookJobModel.findOne({ deliveryId });
    if (existingJob) {
      processedDeliveries.add(deliveryId);
      return { status: 'IGNORED_DUPLICATE', duplicate: true, jobId: existingJob._id.toString() };
    }

    // 3. Durable persistence: Store job in MongoDB BEFORE responding to GitHub
    const job = await WebhookJobModel.create({
      deliveryId,
      event,
      action: payload.action,
      repositoryFullName: payload.repository?.full_name,
      payload,
      status: WebhookJobStatus.QUEUED,
      retries: 0
    });

    processedDeliveries.add(deliveryId);
    if (processedDeliveries.size > 5000) {
      const first = processedDeliveries.values().next().value;
      if (first) processedDeliveries.delete(first);
    }

    // 4. Trigger asynchronous durable processing in the background (non-blocking)
    setImmediate(() => {
      WebhookService.processJob(job._id.toString(), ipAddress).catch((err) => {
        console.error(`[WebhookService] Background job ${job._id} failed:`, err);
      });
    });

    return {
      status: 'QUEUED',
      duplicate: false,
      jobId: job._id.toString()
    };
  }

  /**
   * Process a single queued webhook job durably with retry handling
   */
  static async processJob(jobId: string, ipAddress?: string): Promise<void> {
    const job = await WebhookJobModel.findById(jobId);
    if (!job || job.status === WebhookJobStatus.COMPLETED) {
      return;
    }

    job.status = WebhookJobStatus.PROCESSING;
    await job.save();

    try {
      const { event, payload } = job;
      const { action, repository, pull_request, issue } = payload as GitHubWebhookPayload;

      // Handle Event: pull_request
      if (event === 'pull_request' && pull_request && repository) {
        await WebhookService.handlePullRequestEvent(action, repository, pull_request, ipAddress);
      }

      // Handle Event: issues
      if (event === 'issues' && issue && repository) {
        await WebhookService.handleIssueEvent(action, repository, issue);
      }

      // Log immutable audit entry
      await AuditLogModel.create({
        action: AuditAction.PR_SUBMITTED,
        resourceType: 'GitHubWebhook',
        resourceId: job.deliveryId,
        ipAddress,
        metadata: {
          event: job.event,
          action: job.action,
          deliveryId: job.deliveryId,
          repo: job.repositoryFullName
        }
      });

      job.status = WebhookJobStatus.COMPLETED;
      job.processedAt = new Date();
      await job.save();
    } catch (err: any) {
      job.retries += 1;
      job.backoffMs = Math.min(60000, 1000 * Math.pow(2, job.retries));
      job.lastError = err?.message || 'Unknown processing error';
      if (job.retries >= job.maxRetries) {
        job.status = WebhookJobStatus.FAILED;
      } else {
        job.status = WebhookJobStatus.QUEUED; // Re-queue for retry with backoff
      }
      await job.save();
      throw err;
    }
  }

  /**
   * Handle GitHub pull_request events with reliable issue matching and exact commit SHA tracking
   */
  private static async handlePullRequestEvent(
    action: string | undefined,
    repository: { id: number; full_name: string; owner: { login: string }; name: string },
    pullRequest: {
      number: number;
      title: string;
      body?: string;
      merged?: boolean;
      head: { sha: string; ref: string };
      base: { ref: string };
      user: { login: string };
      html_url: string;
    },
    ipAddress?: string
  ): Promise<void> {
    // 1. Match repository identity
    let repo = await GitHubRepositoryModel.findOne({
      $or: [{ githubRepoId: repository.id }, { fullName: repository.full_name }]
    });

    if (!repo) {
      // Auto-bind repository record if project exists with this repo name
      repo = await GitHubRepositoryModel.create({
        githubRepoId: repository.id,
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        isPrivate: false,
        defaultBranch: pullRequest.base.ref || 'main'
      });
    }

    // 2. Reliable PR-to-Issue-to-Bounty Matching
    // Check PR body & title for explicit GitHub closing keywords (e.g. Fixes #12, Closes #12, Resolves #12)
    const combinedText = `${pullRequest.body || ''} ${pullRequest.title || ''}`;
    const closingKeywordRegex = /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved|refs)\s*#(\d+)/i;
    const keywordMatch = combinedText.match(closingKeywordRegex);

    let issueNumber: number | null = (keywordMatch && keywordMatch[1]) ? parseInt(keywordMatch[1], 10) : null;

    // Fallback: Check explicit #<number> in title or branch
    if (!issueNumber) {
      const explicitHashMatch = (pullRequest.title || '').match(/#(\d+)/);
      if (explicitHashMatch && explicitHashMatch[1]) {
        issueNumber = parseInt(explicitHashMatch[1], 10);
      }
    }

    // Fallback: Check issue/<number> in branch ref
    if (!issueNumber && pullRequest.head?.ref) {
      const branchMatch = pullRequest.head.ref.match(/issue[-/](\d+)/i);
      if (branchMatch && branchMatch[1]) {
        issueNumber = parseInt(branchMatch[1], 10);
      }
    }

    // Check if this PR was already submitted/tracked in this repository
    const existingSubmission = await PullRequestSubmissionModel.findOne({
      repositoryId: repo._id,
      prNumber: pullRequest.number
    });

    let task = null;
    if (existingSubmission) {
      task = await TaskModel.findById(existingSubmission.taskId);
    }

    // Locate matching Task in the repository
    const project = await ProjectModel.findOne({
      $or: [{ githubRepoId: repo._id }, { githubRepo: repository.full_name }]
    });

    if (!task && project && issueNumber) {
      const matchingTasks = await TaskModel.find({ projectId: project._id, githubIssueNumber: issueNumber });
      if (matchingTasks.length === 1) {
        task = matchingTasks[0]!;
      } else if (matchingTasks.length > 1) {
        // Section 2 Rule 6: If ambiguous, mark it unmatched and let the admin choose
        console.warn(`[WebhookService] Ambiguous match: Issue #${issueNumber} matches ${matchingTasks.length} tasks in project. Leaving unmatched.`);
        await AuditLogModel.create({
          action: AuditAction.PR_SUBMITTED,
          resourceType: 'Project',
          resourceId: project._id.toString(),
          ipAddress,
          metadata: {
            warning: 'AMBIGUOUS_TASK_MATCH',
            prNumber: pullRequest.number,
            issueNumber,
            candidateTaskIds: matchingTasks.map((t) => t._id.toString())
          }
        });
        return;
      }
    }
    if (!task && issueNumber) {
      task = await TaskModel.findOne({ githubIssueNumber: issueNumber });
    }

    // If still not matched by issue number, check if the developer claimed an active task in this project
    if (!task && project && pullRequest.user?.login) {
      const devUser = await UserModel.findOne({
        githubUsername: new RegExp(`^${pullRequest.user.login}$`, 'i')
      });
      if (devUser) {
        task = await TaskModel.findOne({
          projectId: project._id,
          assignedDeveloperId: devUser._id,
          status: { $in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.REVISION_REQUESTED] }
        });
      }
    }

    if (!task) {
      console.info(
        `[WebhookService] PR #${pullRequest.number} in ${repository.full_name} does not reference an active OpenProofPay bounty task.`
      );
      return;
    }

    // Claimed Developer Binding Gate: Check claimed developer against PR author
    if (task.assignedDeveloperId && pullRequest.user?.login) {
      const assignedDev = await UserModel.findById(task.assignedDeveloperId);
      if (
        assignedDev?.githubUsername &&
        assignedDev.githubUsername.toLowerCase() !== pullRequest.user.login.toLowerCase()
      ) {
        console.warn(
          `[WebhookService] Author mismatch: PR #${pullRequest.number} author '@${pullRequest.user.login}' does not match claimed developer '@${assignedDev.githubUsername}' for milestone '${task.title}'. Refusing auto-attachment.`
        );
        await AuditLogModel.create({
          action: AuditAction.PR_SUBMITTED,
          resourceType: 'Task',
          resourceId: task._id.toString(),
          ipAddress,
          metadata: {
            warning: 'CLAIMED_DEVELOPER_MISMATCH',
            prNumber: pullRequest.number,
            prAuthor: pullRequest.user.login,
            claimedDeveloper: assignedDev.githubUsername
          }
        });
        return; // Never auto-attach to a wrong task or developer
      }
    }

    // 3. Developer Assignment Safety Gate (Correction #2)
    // NEVER automatically assign an unassigned developer. Require explicit claim or verified association.
    const authorLogin = pullRequest.user?.login || '';
    let authorUser = authorLogin
      ? await UserModel.findOne({
          githubUsername: new RegExp(`^${authorLogin}$`, 'i')
        })
      : null;

    if (task.assignedDeveloperId && authorLogin) {
      const assignedDev = await UserModel.findById(task.assignedDeveloperId);
      if (
        assignedDev?.githubUsername &&
        assignedDev.githubUsername.toLowerCase() !== authorLogin.toLowerCase()
      ) {
        console.warn(
          `[WebhookService] Author mismatch: PR #${pullRequest.number} author '@${authorLogin}' does not match assigned developer '@${assignedDev.githubUsername}' for milestone '${task.title}'.`
        );
        // Do not re-assign developer. Record audit warning.
        await AuditLogModel.create({
          action: AuditAction.PR_SUBMITTED,
          resourceType: 'Task',
          resourceId: task._id.toString(),
          ipAddress,
          metadata: {
            warning: 'PR_AUTHOR_MISMATCH',
            prNumber: pullRequest.number,
            prAuthor: authorLogin,
            assignedDeveloper: assignedDev.githubUsername
          }
        });
      }
    } else {
      console.info(
        `[WebhookService] Milestone task '${task.title}' is currently unassigned. PR #${pullRequest.number} received from '@${authorLogin}'. Not auto-assigning; awaiting explicit developer claim or admin confirmation.`
      );
    }

    // 4. Fetch real, verified PR details, changed files list, and diff patches from GitHub API
    let prDetails: any = null;
    try {
      prDetails = await GitHubService.getPullRequest(
        repository.owner.login,
        repository.name,
        pullRequest.number
      );
    } catch (err: any) {
      console.warn(`[WebhookService] Could not fetch detailed PR files for PR #${pullRequest.number}: ${err.message}`);
      prDetails = {
        title: pullRequest.title,
        body: pullRequest.body,
        htmlUrl: pullRequest.html_url,
        headSha: pullRequest.head?.sha,
        baseBranch: pullRequest.base?.ref,
        headBranch: pullRequest.head?.ref,
        additions: 0,
        deletions: 0,
        changedFilesCount: 0,
        files: []
      };
    }

    const submissionFiles = prDetails.files || [];

    // 5. Create or update PullRequestSubmission
    let submission = await PullRequestSubmissionModel.findOne({
      taskId: task._id,
      prNumber: pullRequest.number
    });

    const newSha = pullRequest.head.sha;

    if (!submission) {
      submission = await PullRequestSubmissionModel.create({
        taskId: task._id,
        developerId: task.assignedDeveloperId || (authorUser ? authorUser._id : task.employerId),
        repositoryId: repo._id,
        prNumber: pullRequest.number,
        prUrl: pullRequest.html_url || prDetails.htmlUrl,
        headSha: newSha,
        baseBranch: pullRequest.base.ref || 'main',
        headBranch: pullRequest.head.ref || 'feature',
        title: pullRequest.title,
        body: pullRequest.body,
        additions: prDetails.additions || 25,
        deletions: prDetails.deletions || 4,
        changedFilesCount: prDetails.changedFilesCount || submissionFiles.length,
        files: submissionFiles,
        status: SubmissionStatus.PENDING
      });
    } else {
      // Synchronize action: new commit SHA arrived (Correction #4)
      if (submission.headSha !== newSha || action === 'synchronize') {
        // Mark all existing verification reports for this submission as outdated
        await VerificationReportModel.updateMany(
          { submissionId: submission._id, isOutdated: false },
          { isOutdated: true }
        );

        submission.headSha = newSha;
        submission.title = pullRequest.title || submission.title;
        submission.body = pullRequest.body || submission.body;
        submission.files = submissionFiles;
        submission.additions = prDetails.additions || submission.additions;
        submission.deletions = prDetails.deletions || submission.deletions;
        submission.changedFilesCount = prDetails.changedFilesCount || submission.changedFilesCount;
        submission.status = SubmissionStatus.PENDING;
        await submission.save();
      }
    }

    // 6. Merging on GitHub NEVER triggers payment or approval
    if (action === 'closed' && pullRequest.merged) {
      await AuditLogModel.create({
        action: AuditAction.PR_SUBMITTED,
        resourceType: 'PullRequest',
        resourceId: submission._id.toString(),
        ipAddress,
        metadata: {
          policy: 'PR_MERGE_NEVER_TRIGGERS_APPROVAL_OR_PAYMENT',
          prNumber: pullRequest.number,
          merged: true,
          taskId: task._id.toString(),
          message: 'GitHub Pull Request was merged, but milestone approval and payment release require explicit human Employer review.'
        }
      });
      return;
    }

    // 7. Transition Task state and launch AI verification
    if (
      task.status === TaskStatus.ASSIGNED ||
      task.status === TaskStatus.IN_PROGRESS ||
      task.status === TaskStatus.REVISION_REQUESTED ||
      task.status === TaskStatus.VERIFICATION_FAILED
    ) {
      await TaskStateMachineService.transition({
        taskId: task._id.toString(),
        targetStatus: TaskStatus.SUBMITTED,
        reason: `PR #${pullRequest.number} detected for commit ${newSha.substring(0, 7)}`
      });
    }

    // Asynchronously execute AI Verification pipeline on the exact commit SHA
    AIVerificationService.verifySubmission(submission._id.toString(), undefined, undefined, ipAddress).catch(
      (err) => {
        console.error(`[WebhookService] Autonomous AI verification failed for submission ${submission!._id}:`, err);
      }
    );

    // Notify Employer of PR event
    if (task.employerId) {
      NotificationService.sendNotification({
        recipientId: task.employerId,
        type: NotificationType.PR_SUBMITTED,
        title: action === 'synchronize' ? 'Pull Request Updated' : 'Pull Request Submitted',
        message: `PR #${pullRequest.number} was ${action || 'submitted'} by @${authorLogin} for milestone "${task.title}". Automated AI verification is running.`,
        resourceType: 'Task',
        resourceId: task._id
      }).catch(() => {});
    }
  }

  /**
   * Handle GitHub issues events: sync description updates with linked bounty tasks
   */
  private static async handleIssueEvent(
    action: string | undefined,
    _repository: { id: number; full_name: string },
    issue: { number: number; title: string; body?: string; state: string }
  ): Promise<void> {
    if (action === 'edited' && issue.body) {
      await TaskModel.findOneAndUpdate(
        { githubIssueNumber: issue.number },
        { description: issue.body, title: issue.title }
      );
    }
  }

  /**
   * Process cryptographically verified PayPal webhook payload idempotently
   */
  static async handlePayPalEvent(
    payload: any,
    _ipAddress?: string
  ): Promise<{ status: string; duplicate?: boolean }> {
    const eventId = payload.id;
    const eventType = payload.event_type;
    const resource = payload.resource || {};

    // 1. Idempotency Gate
    const existingEvent = await PaymentEventModel.findOne({ paypalWebhookId: eventId });
    if (existingEvent) {
      return { status: 'IGNORED_DUPLICATE', duplicate: true };
    }

    // 2. Locate target Payment record
    const customId = resource.custom_id || resource.custom;
    const orderId = resource.id;
    let authId: string | undefined;

    if (eventType.startsWith('PAYMENT.AUTHORIZATION.')) {
      authId = resource.id;
    }

    let payment = null;
    if (customId) {
      payment = await PaymentModel.findOne({ taskId: customId });
    }
    if (!payment && authId) {
      payment = await PaymentModel.findOne({ paypalAuthorizationId: authId });
    }
    if (!payment && orderId) {
      payment = await PaymentModel.findOne({ paypalOrderId: orderId });
    }

    const previousStatus = payment?.status || 'UNKNOWN';
    let newStatus = previousStatus;

    // Handle Payment Capture Webhooks
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' && payment) {
      payment.status = PaymentStatus.CAPTURED;
      if (resource.id) {
        payment.paypalCaptureId = resource.id;
      }
      await payment.save();
      newStatus = PaymentStatus.CAPTURED;
    }

    // Handle Payout Webhooks (PAYMENT.PAYOUTSBATCH.*)
    if (eventType.startsWith('PAYMENT.PAYOUTSBATCH.') && payment) {
      if (eventType === 'PAYMENT.PAYOUTSBATCH.SUCCESS') {
        payment.payoutStatus = 'SUCCESS';
        payment.status = PaymentStatus.PAID_OUT;
        await payment.save();
        newStatus = PaymentStatus.PAID_OUT;
      } else if (eventType === 'PAYMENT.PAYOUTSBATCH.DENIED' || eventType === 'PAYMENT.PAYOUTSBATCH.FAILED') {
        payment.payoutStatus = 'FAILED';
        payment.payoutError = resource.batch_header?.errors?.[0]?.message || 'Payout batch denied or failed';
        await payment.save();
        newStatus = PaymentStatus.PAYOUT_FAILED;
      }
    }

    // Record Immutable Payment Audit Event
    if (payment) {
      await PaymentEventModel.create({
        paymentId: payment._id,
        paypalWebhookId: eventId,
        eventType,
        previousStatus,
        newStatus,
        rawPayloadSummary: resource
      });
    }

    return { status: 'PROCESSED' };
  }
}
