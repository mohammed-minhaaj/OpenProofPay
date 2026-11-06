import mongoose, { Types } from 'mongoose';
import { TaskModel, ITaskDocument, IAcceptanceCriterion } from '../../models/Task.js';
import { ProjectModel } from '../../models/Project.js';
import { UserModel } from '../../models/User.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { VerificationReportModel } from '../../models/VerificationReport.js';
import { TestExecutionModel } from '../../models/TestExecution.js';
import { NotificationService } from '../notifications/notifications.service.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { GitHubService } from '../../services/GitHubService.js';
import { TaskStateMachineService } from '../../services/TaskStateMachineService.js';
import { AppError } from '../../errors/AppError.js';
import { env } from '../../config/env.js';
import {
  TaskStatus,
  UserRole,
  AuditAction,
  NotificationType,
  TaskReviewAction,
  CriterionCategory,
  CreateTaskInput,
  ReviewTaskInput
} from '@openproofpay/shared';

export interface ListTasksFilter {
  projectId?: string;
  status?: TaskStatus;
  assignedDeveloperId?: string;
  employerId?: string;
  search?: string;
}

export class TasksService {
  /**
   * Create a milestone task either manually or by importing from a GitHub Issue
   */
  static async createTask(
    employerId: string,
    input: CreateTaskInput,
    ipAddress?: string
  ): Promise<ITaskDocument> {
    if (!mongoose.Types.ObjectId.isValid(input.projectId)) {
      throw AppError.badRequest('Invalid Project ID format');
    }

    const project = await ProjectModel.findById(input.projectId);
    if (!project) {
      throw AppError.notFound('Parent project not found');
    }

    // Anti-IDOR: Check that the employer owns the project (lenient in dev for multi-account testing)
    const isDev = env.NODE_ENV === 'development';
    if (!isDev && project.ownerId.toString() !== employerId) {
      throw AppError.forbidden('You do not have permission to create tasks under this project');
    }

    let assignedDevId: Types.ObjectId | undefined;
    if (input.assignedDeveloperId) {
      if (!mongoose.Types.ObjectId.isValid(input.assignedDeveloperId)) {
        throw AppError.badRequest('Invalid assigned developer ID format');
      }
      const dev = await UserModel.findById(input.assignedDeveloperId);
      if (!dev) {
        throw AppError.notFound('Assigned developer not found');
      }
      assignedDevId = dev._id;
    }

    // Process payment / bounty amount
    const paymentAmount = input.paymentAmount ?? input.bountyAmount;
    if (!paymentAmount || paymentAmount <= 0) {
      throw AppError.badRequest('Task payment amount must be greater than zero');
    }

    // GitHub Issue Import Handling
    let githubIssueNumber = input.issueNumber;
    let githubIssueUrl = input.issueUrl;

    // Auto-bind repository if issue URL or project name format provided and project has no linked repo
    if (!project.githubRepoId) {
      try {
        let autoOwner = '';
        let autoRepo = '';

        if (githubIssueUrl) {
          let cleanUrl = githubIssueUrl.trim();
          if (!/^https?:\/\//i.test(cleanUrl)) {
            cleanUrl = `https://${cleanUrl}`;
          }
          const parsedUrl = new URL(cleanUrl);
          const parts = parsedUrl.pathname.split('/').filter(Boolean);
          if (parts.length >= 2) {
            autoOwner = parts[0]!;
            autoRepo = parts[1]!;
          }
        } else if (project.name && project.name.includes('/')) {
          const parts = project.name.split('/').map((s: string) => s.trim());
          if (parts.length === 2 && parts[0] && parts[1]) {
            autoOwner = parts[0];
            autoRepo = parts[1];
          }
        }

        if (autoOwner && autoRepo) {
          let repoRecord = await GitHubRepositoryModel.findOne({
            owner: new RegExp(`^${autoOwner}$`, 'i'),
            name: new RegExp(`^${autoRepo}$`, 'i')
          });
          if (!repoRecord) {
            repoRecord = await GitHubRepositoryModel.create({
              githubRepoId: Math.floor(Math.random() * 899999 + 100000),
              owner: autoOwner,
              name: autoRepo,
              fullName: `${autoOwner}/${autoRepo}`,
              defaultBranch: 'main',
              htmlUrl: `https://github.com/${autoOwner}/${autoRepo}`,
              isPrivate: false
            });
          }
          project.githubRepoId = repoRecord._id;
          await project.save();

          if (githubIssueNumber && !githubIssueUrl) {
            githubIssueUrl = `https://github.com/${autoOwner}/${autoRepo}/issues/${githubIssueNumber}`;
          }
        }
      } catch {
        // Fallback to manual
      }
    }

    if (githubIssueNumber && project.githubRepoId) {
      const repo = await GitHubRepositoryModel.findById(project.githubRepoId);
      if (repo) {
        try {
          const ghIssue = await GitHubService.getIssue(repo.owner, repo.name, githubIssueNumber, employerId);
          if (ghIssue) {
            githubIssueUrl = githubIssueUrl || ghIssue.htmlUrl;
          }
        } catch {
          // If GitHub API call fails (e.g. rate limit or offline in tests), fallback to supplied data
        }
      }
    }

    // Process structured acceptance criteria
    const criteria: IAcceptanceCriterion[] = (input.acceptanceCriteria || []).map((c, index) => ({
      id: c.id || `crit-${Date.now()}-${index + 1}`,
      title: c.title || `Criterion #${index + 1}`,
      description: c.description.trim(),
      mandatory: c.mandatory !== false,
      category: c.category || CriterionCategory.FUNCTIONAL
    }));

    const initialStatus = assignedDevId ? TaskStatus.ASSIGNED : TaskStatus.CREATED;

    const task = await TaskModel.create({
      projectId: project._id,
      employerId: new Types.ObjectId(employerId),
      assignedDeveloperId: assignedDevId,
      githubIssueNumber,
      githubIssueUrl,
      title: input.title.trim(),
      description: input.description.trim(),
      acceptanceCriteria: criteria,
      paymentAmount,
      currency: input.currency || 'USD',
      minVerificationScore: input.minVerificationScore ?? 80,
      deadline: input.deadline ? new Date(input.deadline) : undefined,
      status: initialStatus
    });

    // Immutable audit record
    await AuditLogModel.create({
      actorId: new Types.ObjectId(employerId),
      actorRole: UserRole.EMPLOYER,
      action: AuditAction.TASK_CREATED,
      resourceType: 'Task',
      resourceId: task._id.toString(),
      ipAddress,
      metadata: {
        projectId: project._id.toString(),
        title: task.title,
        paymentAmount,
        status: initialStatus,
        issueNumber: githubIssueNumber
      }
    });

    // Notify assigned developer if applicable
    if (assignedDevId) {
      await NotificationService.sendNotification({
        recipientId: assignedDevId,
        type: NotificationType.TASK_ASSIGNED,
        title: 'New Milestone Assigned',
        message: `You have been assigned to milestone: "${task.title}" ($${paymentAmount} ${task.currency})`,
        resourceType: 'Task',
        resourceId: task._id
      });
    }

    return task;
  }

  /**
   * List tasks with filters and role-aware access
   */
  static async listTasks(
    filter: ListTasksFilter,
    currentUserId: string,
    currentUserRole: UserRole
  ): Promise<ITaskDocument[]> {
    const query: Record<string, unknown> = {};

    if (filter.projectId) {
      if (mongoose.Types.ObjectId.isValid(filter.projectId)) {
        query.projectId = new Types.ObjectId(filter.projectId);
      }
    }

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.assignedDeveloperId) {
      if (mongoose.Types.ObjectId.isValid(filter.assignedDeveloperId)) {
        query.assignedDeveloperId = new Types.ObjectId(filter.assignedDeveloperId);
      }
    }

    if (filter.employerId) {
      if (mongoose.Types.ObjectId.isValid(filter.employerId)) {
        query.employerId = new Types.ObjectId(filter.employerId);
      }
    } else if (currentUserRole === UserRole.EMPLOYER && !filter.projectId) {
      // By default, employers see their own tasks (in development, show all tasks for local multi-account testing)
      const isDev = env.NODE_ENV === 'development';
      if (!isDev) {
        query.employerId = new Types.ObjectId(currentUserId);
      }
    }

    if (filter.search) {
      query.$or = [
        { title: { $regex: filter.search, $options: 'i' } },
        { description: { $regex: filter.search, $options: 'i' } }
      ];
    }

    const tasks = await TaskModel.find(query)
      .populate({
        path: 'projectId',
        select: 'name status totalBudget currency githubRepoId',
        populate: {
          path: 'githubRepoId',
          select: 'owner name fullName htmlUrl defaultBranch'
        }
      })
      .populate('employerId', 'name email githubUsername')
      .populate('assignedDeveloperId', 'name email githubUsername')
      .sort({ createdAt: -1 });

    return tasks;
  }

  /**
   * Get single task with complete context (Submissions, Verification Reports, Test Executions)
   */
  static async getTaskById(taskId: string): Promise<{
    task: ITaskDocument;
    submissions: unknown[];
    verificationReports: unknown[];
    testExecutions: unknown[];
  }> {
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      throw AppError.badRequest('Invalid Task ID format');
    }

    const task = await TaskModel.findById(taskId)
      .populate({
        path: 'projectId',
        select: 'name description status githubRepoId',
        populate: {
          path: 'githubRepoId',
          select: 'owner name fullName htmlUrl defaultBranch'
        }
      })
      .populate('employerId', 'name email githubUsername')
      .populate('assignedDeveloperId', 'name email githubUsername');

    if (!task) {
      throw AppError.notFound('Milestone task not found');
    }

    const submissions = await PullRequestSubmissionModel.find({ taskId: task._id })
      .populate('developerId', 'name email githubUsername')
      .sort({ createdAt: -1 });

    const submissionIds = submissions.map((s) => s._id);

    const verificationReports = await VerificationReportModel.find({
      submissionId: { $in: submissionIds }
    }).sort({ generatedAt: -1 });

    const testExecutions = await TestExecutionModel.find({
      submissionId: { $in: submissionIds }
    }).sort({ ranAt: -1 });

    const mappedSubmissions = submissions.map((sub: any) => {
      const doc = sub.toObject ? sub.toObject() : { ...sub };
      doc.files = doc.files || [];
      return doc;
    });

    return {
      task,
      submissions: mappedSubmissions,
      verificationReports,
      testExecutions
    };
  }

  /**
   * Developer starts work on assigned task: ASSIGNED -> IN_PROGRESS
   */
  static async startTask(
    taskId: string,
    developerId: string,
    ipAddress?: string
  ): Promise<ITaskDocument> {
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      throw AppError.badRequest('Invalid Task ID format');
    }

    let task = await TaskModel.findById(taskId);
    if (!task) {
      throw AppError.notFound('Milestone task not found');
    }

    // If unassigned, atomically claim using single conditional update
    if (!task.assignedDeveloperId) {
      const atomicClaimed = await TaskModel.findOneAndUpdate(
        {
          _id: taskId,
          assignedDeveloperId: null,
          status: { $in: [TaskStatus.OPEN, TaskStatus.CREATED, TaskStatus.ASSIGNED] }
        },
        {
          $set: {
            assignedDeveloperId: new Types.ObjectId(developerId),
            status: TaskStatus.ASSIGNED
          }
        },
        { new: true }
      );

      if (!atomicClaimed) {
        // Atomic race resolution: Another developer claimed concurrently
        const refreshed = await TaskModel.findById(taskId);
        if (refreshed?.assignedDeveloperId && refreshed.assignedDeveloperId.toString() !== developerId) {
          throw AppError.forbidden('You are not the assigned developer for this milestone task');
        }
        throw AppError.conflict('This milestone task has already been claimed by another developer');
      }

      await AuditLogModel.create({
        action: AuditAction.TASK_ASSIGNED,
        actorId: new Types.ObjectId(developerId),
        actorRole: UserRole.DEVELOPER,
        resourceType: 'Task',
        resourceId: atomicClaimed._id.toString(),
        ipAddress,
        metadata: { message: `Developer atomically claimed task "${atomicClaimed.title}"` }
      });

      task = atomicClaimed;
    } else if (task.assignedDeveloperId.toString() !== developerId) {
      throw AppError.forbidden('You are not the assigned developer for this milestone task');
    }

    if (task.status === TaskStatus.IN_PROGRESS) {
      return task; // Already in progress
    }

    if (task.status !== TaskStatus.ASSIGNED && task.status !== TaskStatus.CREATED) {
      throw AppError.badRequest(
        `Cannot start milestone from '${task.status}' state. Task must be in ASSIGNED or CREATED.`,
        'INVALID_TASK_STATUS'
      );
    }

    return TaskStateMachineService.transition({
      taskId: task._id.toString(),
      targetStatus: TaskStatus.IN_PROGRESS,
      actorId: developerId,
      actorRole: UserRole.DEVELOPER,
      ipAddress,
      reason: 'Developer started work on milestone deliverable'
    });
  }

  /**
   * Employer Review & Decision Gate (APPROVE, REQUEST_REVISION, REJECT)
   */
  static async reviewTask(
    taskId: string,
    employerId: string,
    input: ReviewTaskInput,
    ipAddress?: string
  ): Promise<ITaskDocument> {
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      throw AppError.badRequest('Invalid Task ID format');
    }

    let task = await TaskModel.findById(taskId);
    if (!task) {
      throw AppError.notFound('Milestone task not found');
    }

    // Anti-IDOR: Check that caller is the employer who owns the task
    if (task.employerId.toString() !== employerId) {
      throw AppError.forbidden('Only the employer who created this milestone can review or approve it');
    }

    // Critical Rule: Self-Approval Prevention
    if (task.assignedDeveloperId && task.assignedDeveloperId.toString() === employerId) {
      throw AppError.forbidden('Developers cannot approve their own milestone deliverables');
    }

    const { action, notes, feedback, reason, failedCriteriaIds, failedTestIds } = input;

    if (action === TaskReviewAction.APPROVE) {
      // Must be awaiting review (or submitted)
      const approvableStates = [TaskStatus.AWAITING_REVIEW, TaskStatus.AWAITING_EMPLOYER_APPROVAL, TaskStatus.SUBMITTED];
      if (!approvableStates.includes(task.status)) {
        throw AppError.badRequest(
          `Cannot approve milestone in '${task.status}' status. Task must be in AWAITING_REVIEW.`,
          'INVALID_TASK_STATUS'
        );
      }

      // Find latest PR submission to link
      const latestSubmission = await PullRequestSubmissionModel.findOne({ taskId: task._id })
        .sort({ createdAt: -1 });

      if (latestSubmission) {
        // Enforce commit SHA binding and report freshness (Rule 3.6 & 11)
        const latestReport = await VerificationReportModel.findOne({ submissionId: latestSubmission._id })
          .sort({ createdAt: -1 });

        if (latestReport) {
          if (latestReport.isOutdated) {
            throw AppError.badRequest(
              'Cannot approve deliverable: The verification report is OUTDATED because newer commits have been pushed. Re-verification is required.',
              'OUTDATED_REPORT'
            );
          }
          if (latestReport.commitSha && latestSubmission.headSha && latestReport.commitSha !== latestSubmission.headSha) {
            throw AppError.badRequest(
              `Cannot approve deliverable: Verification report SHA (${latestReport.commitSha.slice(0, 7)}) does not match current PR head commit SHA (${latestSubmission.headSha.slice(0, 7)}). Re-verification is required.`,
              'SHA_MISMATCH'
            );
          }
        }
      }

      // State machine transition to APPROVED
      const updated = await TaskStateMachineService.transition({
        taskId: task._id.toString(),
        targetStatus: TaskStatus.APPROVED,
        actorId: employerId,
        actorRole: UserRole.EMPLOYER,
        ipAddress,
        reason: notes || 'Employer explicitly approved work deliverable'
      });

      if (latestSubmission) {
        updated.acceptedSubmissionId = latestSubmission._id;
      }

      updated.latestReview = {
        action: TaskReviewAction.APPROVE,
        reviewerId: new Types.ObjectId(employerId),
        notes,
        reviewedAt: new Date()
      };
      await updated.save();

      // Notify developer
      if (updated.assignedDeveloperId) {
        await NotificationService.sendNotification({
          recipientId: updated.assignedDeveloperId,
          type: NotificationType.WORK_APPROVED,
          title: 'Milestone Work Approved! 🎉',
          message: `Your work on "${updated.title}" has been approved! Payment payout is now unlocked.`,
          resourceType: 'Task',
          resourceId: updated._id
        });
      }

      // Auto-initiate configured PayPal payment release workflow if payment escrow is configured
      try {
        const { PaymentModel } = await import('../../models/Payment.js');
        const { PaymentsService } = await import('../payments/payments.service.js');
        const existingPayment = await PaymentModel.findOne({ taskId: updated._id });
        if (existingPayment) {
          await PaymentsService.releasePayment(
            updated._id.toString(),
            employerId,
            UserRole.EMPLOYER,
            ipAddress
          );
        }
      } catch (payErr: any) {
        // If payment escrow was not pre-authorized, employer can also fund/release via PayPal checkout
        console.info(`[TasksService] Milestone approved. PayPal payment workflow note: ${payErr?.message}`);
      }

      return updated;
    }

    if (action === TaskReviewAction.REQUEST_REVISION) {
      if (!feedback || feedback.trim().length < 5) {
        throw AppError.badRequest('Constructive feedback is required when requesting a revision (min 5 chars)');
      }

      const revisableStates = [
        TaskStatus.AWAITING_EMPLOYER_APPROVAL,
        TaskStatus.SUBMITTED,
        TaskStatus.VERIFICATION_FAILED
      ];
      if (!revisableStates.includes(task.status)) {
        throw AppError.badRequest(
          `Cannot request revision for milestone in '${task.status}' status.`,
          'INVALID_TASK_STATUS'
        );
      }

      const updated = await TaskStateMachineService.transition({
        taskId: task._id.toString(),
        targetStatus: TaskStatus.REVISION_REQUESTED,
        actorId: employerId,
        actorRole: UserRole.EMPLOYER,
        ipAddress,
        reason: feedback
      });

      updated.latestReview = {
        action: TaskReviewAction.REQUEST_REVISION,
        reviewerId: new Types.ObjectId(employerId),
        feedback,
        failedCriteriaIds: failedCriteriaIds || [],
        failedTestIds: failedTestIds || [],
        reviewedAt: new Date()
      };
      await updated.save();

      // Notify developer
      if (updated.assignedDeveloperId) {
        await NotificationService.sendNotification({
          recipientId: updated.assignedDeveloperId,
          type: NotificationType.REVISION_REQUESTED,
          title: 'Revision Requested on Milestone',
          message: `Employer requested changes on "${updated.title}": ${feedback.substring(0, 100)}...`,
          resourceType: 'Task',
          resourceId: updated._id
        });
      }

      return updated;
    }

    if (action === TaskReviewAction.REJECT) {
      if (!reason || reason.trim().length < 5) {
        throw AppError.badRequest('Documented reasoning is mandatory when rejecting a milestone (min 5 chars)');
      }

      const updated = await TaskStateMachineService.transition({
        taskId: task._id.toString(),
        targetStatus: TaskStatus.REJECTED,
        actorId: employerId,
        actorRole: UserRole.EMPLOYER,
        ipAddress,
        reason
      });

      updated.latestReview = {
        action: TaskReviewAction.REJECT,
        reviewerId: new Types.ObjectId(employerId),
        reason,
        reviewedAt: new Date()
      };
      await updated.save();

      // Notify developer
      if (updated.assignedDeveloperId) {
        await NotificationService.sendNotification({
          recipientId: updated.assignedDeveloperId,
          type: NotificationType.TASK_UPDATE,
          title: 'Milestone Submission Rejected',
          message: `Milestone "${updated.title}" was rejected: ${reason.substring(0, 100)}...`,
          resourceType: 'Task',
          resourceId: updated._id
        });
      }

      return updated;
    }

    throw AppError.badRequest(`Unknown review action: ${action}`);
  }
}