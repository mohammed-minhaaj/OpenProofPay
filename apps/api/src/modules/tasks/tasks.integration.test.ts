import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from '../../test/setup.js';
import { UserModel } from '../../models/User.js';
import { ProjectModel } from '../../models/Project.js';
import { TaskModel } from '../../models/Task.js';
import { GitHubInstallationModel } from '../../models/GitHubInstallation.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { NotificationModel } from '../../models/Notification.js';
import { TaskStateMachineService } from '../../services/TaskStateMachineService.js';
import { env } from '../../config/env.js';
import {
  TaskStatus,
  UserRole,
  ProjectStatus,
  SubmissionStatus,
  TaskReviewAction,
  CriterionCategory
} from '@openproofpay/shared';

const app = createApp();

describe('Phase 5: Task Management, Employer/Developer Workflows & Revision Loop', () => {
  let employerUser: InstanceType<typeof UserModel>;
  let otherEmployerUser: InstanceType<typeof UserModel>;
  let developerUser: InstanceType<typeof UserModel>;
  let employerToken: string;
  let otherEmployerToken: string;
  let developerToken: string;
  let project: InstanceType<typeof ProjectModel>;
  let repo: InstanceType<typeof GitHubRepositoryModel>;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Create Primary Employer
    employerUser = await UserModel.create({
      email: 'employer@workflows.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Alice Employer',
      role: UserRole.EMPLOYER,
      githubConnected: true,
      githubUsername: 'alice-workflows'
    });
    employerToken = jwt.sign(
      { userId: employerUser._id.toString(), role: UserRole.EMPLOYER, email: employerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 2. Create Secondary Employer (for IDOR attack tests)
    otherEmployerUser = await UserModel.create({
      email: 'hacker-employer@workflows.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Bob Malicious Employer',
      role: UserRole.EMPLOYER,
      githubConnected: true,
      githubUsername: 'bob-malicious'
    });
    otherEmployerToken = jwt.sign(
      { userId: otherEmployerUser._id.toString(), role: UserRole.EMPLOYER, email: otherEmployerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 3. Create Developer
    developerUser = await UserModel.create({
      email: 'dev@workflows.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Charlie Developer',
      role: UserRole.DEVELOPER,
      githubConnected: true,
      githubUsername: 'charlie-dev'
    });
    developerToken = jwt.sign(
      { userId: developerUser._id.toString(), role: UserRole.DEVELOPER, email: developerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 4. Create GitHub Installation & Repository
    const installation = await GitHubInstallationModel.create({
      userId: employerUser._id,
      installationId: 445566,
      accountLogin: 'alice-workflows',
      accountType: 'User',
      encryptedAccessToken: 'iv:tag:cipher'
    });

    repo = await GitHubRepositoryModel.create({
      installationId: installation._id,
      githubRepoId: 991122,
      owner: 'alice-workflows',
      name: 'fintech-service',
      fullName: 'alice-workflows/fintech-service',
      private: true,
      htmlUrl: 'https://github.com/alice-workflows/fintech-service',
      defaultBranch: 'main'
    });

    // 5. Create Project linked to Repository
    project = await ProjectModel.create({
      ownerId: employerUser._id,
      name: 'Fintech Core Microservices',
      description: 'Proof-to-Pay milestone contract testing project',
      githubRepoId: repo._id,
      status: ProjectStatus.ACTIVE,
      totalBudget: 5000,
      currency: 'USD'
    });
  });

  describe('1. Employer Workflow: Project & Task Creation with Acceptance Criteria', () => {
    it('creates a project workspace via POST /api/projects', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          name: 'OpenProofPay Payment Gateway',
          description: 'High performance payment orchestration',
          githubRepoId: repo._id.toString(),
          totalBudget: 3500,
          currency: 'USD'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('OpenProofPay Payment Gateway');
      expect(res.body.data.status).toBe(ProjectStatus.ACTIVE);
    });

    it('creates a task with structured acceptance criteria and assigned developer', async () => {
      const taskInput = {
        projectId: project._id.toString(),
        title: 'Implement AES-256-GCM Token Encryption',
        description: 'Encrypt all OAuth and installation tokens at rest before persisting to MongoDB',
        paymentAmount: 250,
        currency: 'USD',
        assignedDeveloperId: developerUser._id.toString(),
        issueNumber: 42,
        issueUrl: 'https://github.com/alice-workflows/fintech-service/issues/42',
        acceptanceCriteria: [
          {
            id: 'crit-1',
            title: 'AES-256-GCM cipher',
            description: 'Cipher format must be iv:authTag:ciphertext encoded in hex',
            mandatory: true,
            category: CriterionCategory.SECURITY
          },
          {
            id: 'crit-2',
            title: 'Unit test suite',
            description: 'Provide roundtrip encryption/decryption tests with invalid tag detection',
            mandatory: true,
            category: CriterionCategory.TESTING
          }
        ]
      };

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${employerToken}`)
        .send(taskInput);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe(taskInput.title);
      expect(res.body.data.status).toBe(TaskStatus.ASSIGNED);
      expect(res.body.data.paymentAmount).toBe(250);
      expect(res.body.data.acceptanceCriteria).toHaveLength(2);
      expect(res.body.data.acceptanceCriteria[0].category).toBe(CriterionCategory.SECURITY);

      // Verify developer received assignment notification
      const notification = await NotificationModel.findOne({ recipientId: developerUser._id });
      expect(notification).toBeDefined();
      expect(notification?.title).toContain('New Milestone Assigned');
    });

    it('rejects task creation by non-project owner (Anti-IDOR)', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${otherEmployerToken}`)
        .send({
          projectId: project._id.toString(),
          title: 'Malicious Task Injection',
          description: 'Attempting to inject a task into a project owned by another employer',
          paymentAmount: 100
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('You do not have permission to create tasks under this project');
    });
  });

  describe('2. Developer Workflow: Starting Work', () => {
    it('allows assigned developer to transition task from ASSIGNED to IN_PROGRESS', async () => {
      const task = await TaskModel.create({
        projectId: project._id,
        employerId: employerUser._id,
        assignedDeveloperId: developerUser._id,
        title: 'Build Secure Webhook HMAC Handler',
        description: 'Verify GitHub signatures using crypto.timingSafeEqual',
        paymentAmount: 300,
        currency: 'USD',
        status: TaskStatus.ASSIGNED
      });

      const res = await request(app)
        .post(`/api/tasks/${task._id}/start`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send();

      expect([200, 202]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(TaskStatus.IN_PROGRESS);

      const updated = await TaskModel.findById(task._id);
      expect(updated?.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('prevents an unassigned developer from starting a task assigned to someone else', async () => {
      const otherDev = await UserModel.create({
        email: 'otherdev@workflows.com',
        passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
        name: 'Eve Developer',
        role: UserRole.DEVELOPER
      });
      const otherDevToken = jwt.sign(
        { userId: otherDev._id.toString(), role: UserRole.DEVELOPER, email: otherDev.email },
        env.JWT_ACCESS_SECRET
      );

      const task = await TaskModel.create({
        projectId: project._id,
        employerId: employerUser._id,
        assignedDeveloperId: developerUser._id,
        title: 'Private Milestone for Charlie',
        description: 'Only Charlie can work on this milestone',
        paymentAmount: 200,
        status: TaskStatus.ASSIGNED
      });

      const res = await request(app)
        .post(`/api/tasks/${task._id}/start`)
        .set('Authorization', `Bearer ${otherDevToken}`)
        .send();

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('You are not the assigned developer');
    });
  });

  describe('3. Full Multi-Step Lifecycle, Review Decision Gate & Revision Loop', () => {
    it('executes full loop: CREATED -> ASSIGNED -> IN_PROGRESS -> SUBMITTED -> REVISION_REQUESTED -> SUBMITTED -> AWAITING_EMPLOYER_APPROVAL -> APPROVED', async () => {
      // Step 1: Task CREATED (unassigned)
      const task = await TaskModel.create({
        projectId: project._id,
        employerId: employerUser._id,
        title: 'Full Lifecycle Milestone Test',
        description: 'Testing entire end-to-end multi-step state machine with revision loop',
        paymentAmount: 500,
        currency: 'USD',
        status: TaskStatus.CREATED,
        acceptanceCriteria: [
          {
            id: 'c1',
            title: 'Criteria 1',
            description: 'Pass all unit tests',
            mandatory: true,
            category: CriterionCategory.TESTING
          },
          {
            id: 'c2',
            title: 'Criteria 2',
            description: 'Pass security audits',
            mandatory: true,
            category: CriterionCategory.SECURITY
          }
        ]
      });
      expect(task.status).toBe(TaskStatus.CREATED);

      // Step 2: Assigned developer claims or starts work -> ASSIGNED -> IN_PROGRESS
      const startRes = await request(app)
        .post(`/api/tasks/${task._id}/start`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send();

      expect(startRes.status).toBe(200);
      expect(startRes.body.data.status).toBe(TaskStatus.IN_PROGRESS);

      // Step 3: Developer submits PR submission -> SUBMITTED
      const submission1 = await PullRequestSubmissionModel.create({
        taskId: task._id,
        developerId: developerUser._id,
        repositoryId: repo._id,
        prNumber: 101,
        prUrl: 'https://github.com/alice-workflows/fintech-service/pull/101',
        headSha: '1111111111111111111111111111111111111111',
        baseBranch: 'main',
        headBranch: 'feat/webhook',
        title: 'Initial Webhook implementation',
        status: SubmissionStatus.PENDING
      });
      expect(submission1._id).toBeDefined();

      await TaskStateMachineService.transition({
        taskId: task._id.toString(),
        targetStatus: TaskStatus.SUBMITTED,
        actorId: developerUser._id.toString(),
        actorRole: UserRole.DEVELOPER
      });

      let currentTask = await TaskModel.findById(task._id);
      expect(currentTask?.status).toBe(TaskStatus.SUBMITTED);

      // Step 4: Employer inspects work and Requests Revision with structured feedback
      const revisionRes = await request(app)
        .post(`/api/tasks/${task._id}/review`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          action: TaskReviewAction.REQUEST_REVISION,
          feedback: 'Security test failed: Timing attack protection missing in HMAC comparison. Please use crypto.timingSafeEqual.',
          failedCriteriaIds: ['c2']
        });

      expect(revisionRes.status).toBe(200);
      expect(revisionRes.body.data.status).toBe(TaskStatus.REVISION_REQUESTED);

      currentTask = await TaskModel.findById(task._id);
      expect(currentTask?.status).toBe(TaskStatus.REVISION_REQUESTED);
      expect(currentTask?.latestReview?.action).toBe(TaskReviewAction.REQUEST_REVISION);
      expect(currentTask?.latestReview?.failedCriteriaIds).toContain('c2');

      // Step 5: Developer updates code and resubmits work -> SUBMITTED
      const submission2 = await PullRequestSubmissionModel.create({
        taskId: task._id,
        developerId: developerUser._id,
        repositoryId: repo._id,
        prNumber: 101,
        prUrl: 'https://github.com/alice-workflows/fintech-service/pull/101',
        headSha: '2222222222222222222222222222222222222222',
        baseBranch: 'main',
        headBranch: 'feat/webhook',
        title: 'Fix timing safe equal HMAC comparison',
        status: SubmissionStatus.PENDING
      });

      await TaskStateMachineService.transition({
        taskId: task._id.toString(),
        targetStatus: TaskStatus.SUBMITTED,
        actorId: developerUser._id.toString(),
        actorRole: UserRole.DEVELOPER
      });

      currentTask = await TaskModel.findById(task._id);
      expect(currentTask?.status).toBe(TaskStatus.SUBMITTED);

      // Step 6: Automated verification passes -> AWAITING_EMPLOYER_APPROVAL
      await TaskStateMachineService.transition({
        taskId: task._id.toString(),
        targetStatus: TaskStatus.AWAITING_EMPLOYER_APPROVAL
      });

      currentTask = await TaskModel.findById(task._id);
      expect(currentTask?.status).toBe(TaskStatus.AWAITING_EMPLOYER_APPROVAL);

      // Step 7: Explicit Human Employer Decision Gate -> APPROVE
      const approveRes = await request(app)
        .post(`/api/tasks/${task._id}/review`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          action: TaskReviewAction.APPROVE,
          notes: 'Timing attack protection verified. All 2 acceptance criteria pass in isolated tests.'
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe(TaskStatus.APPROVED);

      currentTask = await TaskModel.findById(task._id);
      expect(currentTask?.status).toBe(TaskStatus.APPROVED);
      expect(currentTask?.acceptedSubmissionId?.toString()).toBe(submission2._id.toString());
      expect(currentTask?.latestReview?.action).toBe(TaskReviewAction.APPROVE);
    });
  });

  describe('4. Security & Access Control Gates', () => {
    it('prevents a developer from approving their own work (Anti-Self-Approval)', async () => {
      const task = await TaskModel.create({
        projectId: project._id,
        employerId: employerUser._id,
        assignedDeveloperId: developerUser._id,
        title: 'Self-Approval Attack Test',
        description: 'Developer attempts to call review endpoint to approve their own deliverable',
        paymentAmount: 400,
        status: TaskStatus.AWAITING_EMPLOYER_APPROVAL
      });

      const res = await request(app)
        .post(`/api/tasks/${task._id}/review`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          action: TaskReviewAction.APPROVE,
          notes: 'Self-approving my own deliverable'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Access forbidden');
    });

    it('prevents an employer from reviewing a task owned by another employer (Anti-IDOR)', async () => {
      const task = await TaskModel.create({
        projectId: project._id,
        employerId: employerUser._id,
        assignedDeveloperId: developerUser._id,
        title: 'IDOR Protection Milestone',
        description: 'Other employer tries to approve or reject this milestone',
        paymentAmount: 500,
        status: TaskStatus.AWAITING_EMPLOYER_APPROVAL
      });

      const res = await request(app)
        .post(`/api/tasks/${task._id}/review`)
        .set('Authorization', `Bearer ${otherEmployerToken}`)
        .send({
          action: TaskReviewAction.APPROVE,
          notes: 'Malicious approval attempt'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Only the employer who created this milestone can review or approve it');
    });

    it('rejects task with mandatory reason: transitions to REJECTED', async () => {
      const task = await TaskModel.create({
        projectId: project._id,
        employerId: employerUser._id,
        assignedDeveloperId: developerUser._id,
        title: 'Substandard Code Quality Task',
        description: 'Code contains security flaws and fails architecture boundaries',
        paymentAmount: 350,
        status: TaskStatus.AWAITING_EMPLOYER_APPROVAL
      });

      const res = await request(app)
        .post(`/api/tasks/${task._id}/review`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          action: TaskReviewAction.REJECT,
          reason: 'Hardcoded secrets and failed SQL injection test suite'
        });

      expect([200, 202]).toContain(res.status);
      expect(res.body.data.status).toBe(TaskStatus.REJECTED);

      const updated = await TaskModel.findById(task._id);
      expect(updated?.status).toBe(TaskStatus.REJECTED);
      expect(updated?.latestReview?.reason).toContain('Hardcoded secrets');
    });
  });

  describe('5. Critical Rule: PR Merge != Approval', () => {
    it('ensures that a GitHub PR merge webhook event NEVER transitions the task to APPROVED', async () => {
      const task = await TaskModel.create({
        projectId: project._id,
        employerId: employerUser._id,
        assignedDeveloperId: developerUser._id,
        title: 'PR Merge Autonomy Barrier Test',
        description: 'PR merged on GitHub must never unlock payment or approve milestone autonomously',
        paymentAmount: 600,
        status: TaskStatus.SUBMITTED
      });

      const submission = await PullRequestSubmissionModel.create({
        taskId: task._id,
        developerId: developerUser._id,
        repositoryId: repo._id,
        prNumber: 99,
        prUrl: 'https://github.com/alice-workflows/fintech-service/pull/99',
        headSha: '9999999999999999999999999999999999999999',
        baseBranch: 'main',
        headBranch: 'feat/test',
        title: 'PR to merge on GitHub',
        status: SubmissionStatus.PENDING
      });
      expect(submission._id).toBeDefined();

      const payload = {
        action: 'closed',
        repository: {
          id: repo.githubRepoId,
          full_name: repo.fullName,
          name: repo.name,
          owner: { login: repo.owner }
        },
        pull_request: {
          number: 99,
          title: 'PR to merge on GitHub',
          state: 'closed',
          merged: true,
          head: { sha: '9999999999999999999999999999999999999999', ref: 'feat/test' },
          base: { ref: 'main' }
        }
      };

      const webhookSecret = 'test_webhook_secret_key_123';
      (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET = webhookSecret;

      const payloadString = JSON.stringify(payload);
      const deliveryId = crypto.randomUUID();
      const signature = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(payloadString).digest('hex');

      const res = await request(app)
        .post('/api/webhooks/github')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', deliveryId)
        .set('x-hub-signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString);

      expect([200, 202]).toContain(res.status);

      // Verify the task remained in SUBMITTED (NOT APPROVED!)
      const untouchedTask = await TaskModel.findById(task._id);
      expect(untouchedTask?.status).toBe(TaskStatus.SUBMITTED);
      expect(untouchedTask?.status).not.toBe(TaskStatus.APPROVED);
      expect(untouchedTask?.acceptedSubmissionId).toBeUndefined();
    });
  });

  describe('6. Phase 1: Atomic Claiming Race & Unambiguous Matching', () => {
    it('atomic claim race: exactly 1 developer wins when multiple developers claim simultaneously', async () => {
      // 1. Create an open unclaimed bounty task
      const openTask = await TaskModel.create({
        projectId: project._id,
        employerId: employerUser._id,
        title: 'High-Demand Bounty: Atomic Concurrency Lock',
        description: 'Test that atomic MongoDB conditional query prevents double claims',
        paymentAmount: 500,
        currency: 'USD',
        status: TaskStatus.CREATED,
        acceptanceCriteria: [
          { id: 'c1', title: 'Criteria 1', description: 'Mandatory', mandatory: true },
          { id: 'c2', title: 'Criteria 2', description: 'Mandatory', mandatory: true }
        ]
      });

      // 2. Create 5 distinct developers
      const developers = await Promise.all(
        [1, 2, 3, 4, 5].map(async (i) => {
          const user = await UserModel.create({
            email: `racer${i}@test.com`,
            name: `Racer Dev ${i}`,
            role: UserRole.DEVELOPER,
            passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
            githubUsername: `racerdev${i}`,
            isEmailVerified: true
          });
          const token = jwt.sign(
            { userId: user._id.toString(), role: user.role, email: user.email },
            env.JWT_ACCESS_SECRET
          );
          return { user, token };
        })
      );

      // 3. Fire all 5 claim requests concurrently in parallel
      const results = await Promise.all(
        developers.map(({ token }) =>
          request(app)
            .post(`/api/tasks/${openTask._id}/claim`)
            .set('Authorization', `Bearer ${token}`)
        )
      );

      // 4. Verify exactly ONE 200 OK and FOUR 403 or 409 rejections
      const successes = results.filter((r) => r.status === 200);
      const rejections = results.filter((r) => r.status === 403 || r.status === 409);

      expect(successes.length).toBe(1);
      expect(rejections.length).toBe(4);

      // 5. Verify the task in database has the winning developer
      const refreshedTask = await TaskModel.findById(openTask._id);
      expect(refreshedTask?.assignedDeveloperId).toBeDefined();
      expect(refreshedTask?.assignedDeveloperId?.toString()).toBe(
        successes[0]!.body.data.assignedDeveloperId
      );
    });

    it('refuses auto-attachment if PR author does not match claimed developer', async () => {
      // Task is claimed by developerUser ('bob-developer')
      const claimedTask = await TaskModel.create({
        projectId: project._id,
        employerId: employerUser._id,
        assignedDeveloperId: developerUser._id,
        githubIssueNumber: 777,
        title: 'Task claimed by Bob',
        description: 'Fixes #777',
        paymentAmount: 300,
        status: TaskStatus.IN_PROGRESS
      });

      // Webhook arrives from a completely different user ('evil-hacker')
      const payload = {
        action: 'opened',
        repository: {
          id: repo.githubRepoId,
          full_name: repo.fullName,
          name: repo.name,
          owner: { login: repo.owner }
        },
        pull_request: {
          number: 888,
          title: 'Fixes #777 - Unauthorized contribution',
          body: 'Fixes #777',
          state: 'open',
          head: { sha: '8888888888888888888888888888888888888888', ref: 'exploit' },
          base: { ref: 'main' },
          user: { login: 'evil-hacker' }
        }
      };

      const webhookSecret = 'test_webhook_secret_key_123';
      (env as { GITHUB_WEBHOOK_SECRET?: string }).GITHUB_WEBHOOK_SECRET = webhookSecret;
      const payloadString = JSON.stringify(payload);
      const deliveryId = crypto.randomUUID();
      const signature = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(payloadString).digest('hex');

      const res = await request(app)
        .post('/api/webhooks/github')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', deliveryId)
        .set('x-hub-signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString);

      expect([200, 202]).toContain(res.status);

      // Wait a moment for durable worker
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Task must remain assigned to Bob and have NO submission attached from evil-hacker
      const verifiedTask = await TaskModel.findById(claimedTask._id);
      expect(verifiedTask?.assignedDeveloperId?.toString()).toBe(developerUser._id.toString());
      expect(verifiedTask?.acceptedSubmissionId).toBeUndefined();

      const evilSubmission = await PullRequestSubmissionModel.findOne({ prNumber: 888 });
      expect(evilSubmission).toBeNull();
    });
  });
});