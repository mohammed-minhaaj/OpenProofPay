import { TaskModel } from '../../models/Task.js';
import { ProjectModel } from '../../models/Project.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { UserModel } from '../../models/User.js';
import { PullRequestSubmissionModel, IPullRequestSubmissionDocument } from '../../models/PullRequestSubmission.js';
import { TaskStateMachineService } from '../../services/TaskStateMachineService.js';
import { GitHubService } from '../../services/GitHubService.js';
import { NotificationService } from '../notifications/notifications.service.js';
import { AppError } from '../../errors/AppError.js';
import { TaskStatus, SubmissionStatus, UserRole, NotificationType } from '@openproofpay/shared';

export interface SubmitPRInput {
  taskId: string;
  developerId: string;
  prUrl: string;
  prNumber?: number;
}

export class SubmissionsService {
  /**
   * Submit untrusted PR for rigorous validation and verification pipeline
   */
  static async submitPR(input: SubmitPRInput, ipAddress?: string): Promise<IPullRequestSubmissionDocument> {
    const { taskId, developerId, prUrl, prNumber: inputPrNum } = input;

    // 1. Verify Developer Account & GitHub Link
    const developer = await UserModel.findById(developerId);
    if (!developer) {
      throw AppError.notFound('Developer not found');
    }

    const isDev = process.env.NODE_ENV === 'development';

    if (!isDev && (!developer.githubConnected || !developer.githubUsername)) {
      throw AppError.badRequest(
        'Please connect your GitHub account in Settings before submitting Pull Requests',
        'GITHUB_NOT_CONNECTED'
      );
    }

    // 2. Look up Task and verify state
    const task = await TaskModel.findById(taskId);
    if (!task) {
      throw AppError.notFound('Milestone task not found');
    }

    // Assign developer if task was unassigned
    if (!task.assignedDeveloperId) {
      task.assignedDeveloperId = developer._id;
      if (task.status === TaskStatus.CREATED) {
        task.status = TaskStatus.ASSIGNED;
      }
      await task.save();
    } else if (task.assignedDeveloperId.toString() !== developerId) {
      throw AppError.forbidden('You are not assigned to this milestone task');
    }

    // Confirm task is in a submittable state
    const submittableStates = [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.REVISION_REQUESTED];
    if (!submittableStates.includes(task.status)) {
      throw AppError.badRequest(
        `Cannot submit work for task in '${task.status}' status. Task must be in ASSIGNED, IN_PROGRESS, or REVISION_REQUESTED.`,
        'INVALID_TASK_STATUS'
      );
    }

    // 3. Look up Project and linked GitHubRepository
    const project = await ProjectModel.findById(task.projectId);
    if (!project) {
      throw AppError.notFound('Parent project not found');
    }

    // 4. Parse and normalize PR URL (Anti-Spoofing & Auto-Link)
    let cleanPrUrl = prUrl.trim();
    if (!/^https?:\/\//i.test(cleanPrUrl)) {
      cleanPrUrl = `https://${cleanPrUrl}`;
    }

    let prNumber = inputPrNum;
    let urlOwner = '';
    let urlRepo = '';

    try {
      const parsedUrl = new URL(cleanPrUrl);
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        urlOwner = parts[0]!;
        urlRepo = parts[1]!;
      }
      if (parts.length >= 4 && parts[2] === 'pull') {
        prNumber = parseInt(parts[3]!, 10);
      }
    } catch {
      if (!prNumber) {
        throw AppError.badRequest('Invalid GitHub Pull Request URL or number format');
      }
    }

    if (!prNumber || isNaN(prNumber)) {
      throw AppError.badRequest('Could not determine Pull Request number from URL');
    }

    // Auto-bind repository to project if project has no repo linked yet
    if (!project.githubRepoId && urlOwner && urlRepo) {
      let repoRecord = await GitHubRepositoryModel.findOne({
        owner: new RegExp(`^${urlOwner}$`, 'i'),
        name: new RegExp(`^${urlRepo}$`, 'i')
      });
      if (!repoRecord) {
        repoRecord = await GitHubRepositoryModel.create({
          githubRepoId: Math.floor(Math.random() * 899999 + 100000),
          owner: urlOwner,
          name: urlRepo,
          fullName: `${urlOwner}/${urlRepo}`,
          defaultBranch: 'main',
          htmlUrl: `https://github.com/${urlOwner}/${urlRepo}`,
          isPrivate: false
        });
      }
      project.githubRepoId = repoRecord._id;
      await project.save();
    }

    if (!project.githubRepoId) {
      throw AppError.badRequest('Project does not have a linked GitHub repository. Please provide a full GitHub PR URL (e.g. https://github.com/owner/repo/pull/1)', 'REPO_NOT_LINKED');
    }

    const linkedRepo = await GitHubRepositoryModel.findById(project.githubRepoId);
    if (!linkedRepo) {
      throw AppError.notFound('Linked GitHub repository record not found');
    }

    // Strict repository mismatch check (Rule 14 & Phase 4 Section 3)
    if (
      urlOwner &&
      urlRepo &&
      (urlOwner.toLowerCase() !== linkedRepo.owner.toLowerCase() ||
        urlRepo.toLowerCase() !== linkedRepo.name.toLowerCase())
    ) {
      throw AppError.badRequest(
        `Repository mismatch: PR is for '${urlOwner}/${urlRepo}', but this task belongs to '${linkedRepo.fullName}'`,
        'REPOSITORY_MISMATCH'
      );
    }

    // 5. Fetch real, verified PR from GitHub API
    const prDetails = await GitHubService.getPullRequest(
      linkedRepo.owner,
      linkedRepo.name,
      prNumber,
      developerId || task.employerId?.toString()
    );

    // Verify PR author matches developer GitHub username (skip in development without OAuth)
    if (developer.githubUsername && prDetails.author !== 'unknown') {
      if (prDetails.author.toLowerCase() !== developer.githubUsername.toLowerCase()) {
        throw AppError.forbidden(
          `PR author mismatch: PR #${prNumber} was authored by '@${prDetails.author}', but your connected account is '@${developer.githubUsername}'`,
          'AUTHOR_MISMATCH'
        );
      }
    }

    // 6. Duplicate Submission Protection (Rule 18)
    const existingSubmission = await PullRequestSubmissionModel.findOne({
      taskId: task._id,
      headSha: prDetails.headSha,
      status: { $in: [SubmissionStatus.PENDING, SubmissionStatus.EVALUATING, SubmissionStatus.PASSED] }
    });

    if (existingSubmission) {
      throw AppError.conflict(
        `A submission for commit SHA ${prDetails.headSha.substring(0, 7)} is already active on this task`,
        'DUPLICATE_SUBMISSION'
      );
    }

    // 7. Transition Task State Machine to SUBMITTED
    await TaskStateMachineService.transition({
      taskId: task._id.toString(),
      targetStatus: TaskStatus.SUBMITTED,
      actorId: developerId,
      actorRole: UserRole.DEVELOPER,
      ipAddress,
      metadata: {
        prNumber,
        headSha: prDetails.headSha,
        prUrl: prDetails.htmlUrl
      }
    });

    // Actual changed files from GitHub (no fabricated fallbacks)
    const submissionFiles = prDetails.files || [];

    // Initial pipeline stages tracking
    const initialStages = [
      {
        stage: 'PR_RECEIVED',
        timestamp: new Date(),
        status: 'COMPLETED' as const,
        details: `Received PR #${prNumber} from GitHub`
      },
      {
        stage: 'PR_METADATA_FETCHED',
        timestamp: new Date(),
        status: 'COMPLETED' as const,
        details: `Head SHA: ${prDetails.headSha.slice(0, 7)}, Base: ${prDetails.baseBranch}`
      },
      {
        stage: 'PR_FILES_FETCHED',
        timestamp: new Date(),
        status: 'COMPLETED' as const,
        details: `Retrieved ${submissionFiles.length} changed files from GitHub Pull Requests API`
      }
    ];

    // 8. Create PullRequestSubmission Record
    const submission = await PullRequestSubmissionModel.create({
      taskId: task._id,
      developerId: developer._id,
      repositoryId: linkedRepo._id,
      prNumber,
      prUrl: prDetails.htmlUrl,
      headSha: prDetails.headSha,
      baseBranch: prDetails.baseBranch,
      headBranch: prDetails.headBranch,
      title: prDetails.title,
      body: prDetails.body,
      additions: prDetails.additions || 0,
      deletions: prDetails.deletions || 0,
      changedFilesCount: prDetails.changedFilesCount || submissionFiles.length,
      files: submissionFiles,
      status: SubmissionStatus.PENDING,
      currentStage: 'PR_FILES_FETCHED',
      pipelineStages: initialStages
    });

    // 9. Notify Employer of PR Submission
    if (task.employerId) {
      const devName = developer.githubUsername || developer.name || 'Developer';
      await NotificationService.sendNotification({
        recipientId: task.employerId,
        type: NotificationType.PR_SUBMITTED,
        title: 'Pull Request Submitted',
        message: `Developer @${devName} submitted PR #${prNumber} for milestone "${task.title}"`,
        resourceType: 'Task',
        resourceId: task._id
      });
    }

    return submission;
  }
}
