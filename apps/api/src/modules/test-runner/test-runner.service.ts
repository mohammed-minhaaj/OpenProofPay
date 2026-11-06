import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { PullRequestSubmissionModel, IPullRequestSubmissionDocument } from '../../models/PullRequestSubmission.js';
import { TaskModel } from '../../models/Task.js';
import { ProjectModel } from '../../models/Project.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { TestExecutionModel, ITestExecutionDocument } from '../../models/TestExecution.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { GitHubService } from '../../services/GitHubService.js';
import { ProjectDetector } from './ProjectDetector.js';
import { OutputParser } from './OutputParser.js';
import { LogSanitizer } from './LogSanitizer.js';
import { DockerSandboxRunner } from './DockerSandboxRunner.js';
import { MockSandboxRunner } from './MockSandboxRunner.js';
import { ISandboxRunner, DetectedProject } from './interfaces.js';
import { AppError } from '../../errors/AppError.js';
import { AuditAction } from '@openproofpay/shared';

export interface ExecuteTestOptions {
  runner?: ISandboxRunner;
  timeoutMs?: number;
  filesOverride?: Record<string, string>;
  actorId?: string;
  actorRole?: string;
  ipAddress?: string;
}

export class TestRunnerService {
  private static globalRunnerOverride: ISandboxRunner | null = null;

  /**
   * Set custom runner for tests or isolated environments
   */
  static setRunnerOverride(runner: ISandboxRunner | null): void {
    this.globalRunnerOverride = runner;
  }

  /**
   * Determine the appropriate sandbox runner
   */
  static async resolveRunner(customRunner?: ISandboxRunner): Promise<ISandboxRunner> {
    if (customRunner) return customRunner;
    if (this.globalRunnerOverride) return this.globalRunnerOverride;

    if (process.env.TEST_RUNNER_MODE === 'mock') {
      return new MockSandboxRunner();
    }

    const dockerRunner = new DockerSandboxRunner();
    const isDockerAvailable = await dockerRunner.isAvailable();
    if (isDockerAvailable) {
      return dockerRunner;
    }

    // If Docker daemon is unavailable, return dockerRunner so it honestly returns COULD_NOT_EXECUTE
    // unless TEST_RUNNER_MODE === 'mock'
    return dockerRunner;
  }

  /**
   * Execute automated tests for a submission in an isolated sandbox
   */
  static async executeSubmissionTests(
    submissionId: string,
    options?: ExecuteTestOptions
  ): Promise<ITestExecutionDocument> {
    const submission = await PullRequestSubmissionModel.findById(submissionId);
    if (!submission) {
      throw AppError.notFound(`Pull request submission '${submissionId}' not found`);
    }

    const task = await TaskModel.findById(submission.taskId);
    if (!task) {
      throw AppError.notFound(`Milestone task '${submission.taskId}' not found`);
    }

    const commitSha = submission.headSha;
    const startTime = Date.now();

    // 1. Setup Ephemeral Workspace
    const tempDir = path.join(
      os.tmpdir(),
      `opp-testrun-${submission.prNumber}-${crypto.randomBytes(6).toString('hex')}`
    );

    try {
      await fs.promises.mkdir(tempDir, { recursive: true });

      // 2. Fetch and populate repository files into ephemeral workspace
      await this.populateWorkspace(tempDir, submission, task, options?.filesOverride);

      // 3. Detect Project Runtime & Test Framework
      const detected: DetectedProject = await ProjectDetector.detectFromDirectory(tempDir);

      // 4. Honest State: NOT_CONFIGURED
      if (!detected.hasTests || detected.framework === 'none' || !detected.testCommand) {
        const notConfiguredDoc = await this.saveTestExecution({
          submissionId: submission._id.toString(),
          taskId: task._id.toString(),
          commitSha,
          runtimeEnvironment: 'none',
          frameworkDetected: undefined,
          commandsExecuted: [],
          status: 'NOT_CONFIGURED',
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0,
          durationMs: Date.now() - startTime,
          sanitizedLogs: 'No test configuration, test files, or supported test runner detected in repository.'
        });

        await this.logAudit({
          taskId: task._id.toString(),
          submissionId: submission._id.toString(),
          actorId: options?.actorId,
          status: 'NOT_CONFIGURED',
          ipAddress: options?.ipAddress
        });

        return notConfiguredDoc;
      }

      // 5. Resolve Sandbox Runner
      const runner = await this.resolveRunner(options?.runner);
      const isAvailable = await runner.isAvailable();

      // Honest State: COULD_NOT_EXECUTE if runner cannot start
      if (!isAvailable) {
        const couldNotExecuteDoc = await this.saveTestExecution({
          submissionId: submission._id.toString(),
          taskId: task._id.toString(),
          commitSha,
          runtimeEnvironment: detected.runtimeImage,
          frameworkDetected: detected.framework,
          commandsExecuted: [detected.testCommand],
          exitCode: 127,
          status: 'COULD_NOT_EXECUTE',
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0,
          durationMs: Date.now() - startTime,
          sanitizedLogs: 'Isolated sandbox container execution failed: Docker daemon is unavailable or host environment restricted.'
        });

        return couldNotExecuteDoc;
      }

      // 6. Execute Test in Sandbox with Strict Boundaries
      const sandboxResult = await runner.runInSandbox({
        workspaceDir: tempDir,
        testCommand: detected.testCommand,
        runtimeImage: detected.runtimeImage,
        timeoutMs: options?.timeoutMs || 120000,
        cpuLimit: '1.0',
        memoryLimit: '512m',
        pidsLimit: 64,
        networkMode: 'none',
        readOnlyRoot: true
      });

      const durationMs = sandboxResult.durationMs || (Date.now() - startTime);

      // 7. Parse Structured Test Output
      const parsedOutput = OutputParser.parse(sandboxResult.rawLogs, detected.framework);

      // 8. Honest 4-State Classification Logic
      let status: 'PASSED' | 'FAILED' | 'COULD_NOT_EXECUTE' | 'NOT_CONFIGURED' = 'FAILED';

      if (sandboxResult.timedOut) {
        status = 'COULD_NOT_EXECUTE';
      } else if (sandboxResult.oomKilled) {
        status = 'COULD_NOT_EXECUTE';
      } else if (!sandboxResult.executedInContainer && sandboxResult.errorMessage) {
        status = 'COULD_NOT_EXECUTE';
      } else if (sandboxResult.exitCode === 0) {
        if (parsedOutput.totalTests > 0 && parsedOutput.failedTests === 0) {
          status = 'PASSED';
        } else if (parsedOutput.passedTests > 0 && parsedOutput.failedTests === 0) {
          status = 'PASSED';
        } else {
          // Exited 0 but 0 tests parsed or strange output
          status = parsedOutput.totalTests === 0 ? 'NOT_CONFIGURED' : 'PASSED';
        }
      } else {
        // Non-zero exit code
        status = 'FAILED';
      }

      // STRICT RULE: Never label NOT_CONFIGURED or COULD_NOT_EXECUTE as PASSED
      if (status === 'PASSED' && (!detected.hasTests || sandboxResult.timedOut || sandboxResult.oomKilled)) {
        status = 'COULD_NOT_EXECUTE';
      }

      // 9. Sanitize Logs (ANSI-stripped, secret-scrubbed, truncated safely)
      let logOutput = sandboxResult.rawLogs;
      if (sandboxResult.timedOut) {
        logOutput += `\n\n[SANDBOX TIMEOUT] Test execution exceeded hard limit of ${options?.timeoutMs || 120000}ms. Container killed.`;
      }
      if (sandboxResult.oomKilled) {
        logOutput += `\n\n[SANDBOX OOM] Container exceeded memory limit (512MB). Process terminated.`;
      }

      const sanitizedLogs = LogSanitizer.sanitize(logOutput);

      // 10. Persist TestExecution Record
      const testExecution = await this.saveTestExecution({
        submissionId: submission._id.toString(),
        taskId: task._id.toString(),
        commitSha,
        runtimeEnvironment: detected.runtimeImage,
        frameworkDetected: detected.framework,
        commandsExecuted: [detected.testCommand],
        exitCode: sandboxResult.exitCode,
        status,
        totalTests: parsedOutput.totalTests,
        passedTests: parsedOutput.passedTests,
        failedTests: parsedOutput.failedTests,
        skippedTests: parsedOutput.skippedTests,
        durationMs,
        sanitizedLogs
      });

      // 11. Audit Logging
      await this.logAudit({
        taskId: task._id.toString(),
        submissionId: submission._id.toString(),
        actorId: options?.actorId,
        status,
        ipAddress: options?.ipAddress
      });

      return testExecution;
    } finally {
      // GUARANTEED workspace destruction
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore deletion errors in temp cleanup
      }
    }
  }

  /**
   * Helper to fetch latest TestExecution for a task
   */
  static async getLatestExecutionForTask(taskId: string): Promise<ITestExecutionDocument | null> {
    return TestExecutionModel.findOne({ taskId }).sort({ createdAt: -1 });
  }

  /**
   * Helper to fetch TestExecution for a specific submission
   */
  static async getExecutionForSubmission(submissionId: string): Promise<ITestExecutionDocument | null> {
    return TestExecutionModel.findOne({ submissionId }).sort({ createdAt: -1 });
  }

  /**
   * Populate workspace with repository files or provided file overrides
   */
  private static async populateWorkspace(
    dir: string,
    submission: IPullRequestSubmissionDocument,
    task: any,
    filesOverride?: Record<string, string>
  ): Promise<void> {
    // If filesOverride is provided (e.g. testing or mock submission), write directly
    if (filesOverride && Object.keys(filesOverride).length > 0) {
      for (const [relPath, content] of Object.entries(filesOverride)) {
        const full = path.join(dir, relPath);
        await fs.promises.mkdir(path.dirname(full), { recursive: true });
        await fs.promises.writeFile(full, content, 'utf-8');
      }
      return;
    }

    // Try fetching via GitHubService if repository is linked
    try {
      const project = await ProjectModel.findById(task.projectId);
      if (project && project.githubRepoId) {
        const repo = await GitHubRepositoryModel.findById(project.githubRepoId);
        if (repo) {
          const pr = await GitHubService.getPullRequest(
            repo.owner,
            repo.name,
            submission.prNumber,
            task.employerId.toString()
          );

          if (pr.files && pr.files.length > 0) {
            for (const f of pr.files) {
              const full = path.join(dir, f.filename);
              await fs.promises.mkdir(path.dirname(full), { recursive: true });
              // Write patch or placeholder content
              await fs.promises.writeFile(
                full,
                f.patch || `// Content for ${f.filename}\n`,
                'utf-8'
              );
            }
          }
        }
      }
    } catch {
      // In isolated/mock environments without GitHub access, create basic structure
    }
  }

  /**
   * Save or update TestExecution record
   */
  private static async saveTestExecution(data: {
    submissionId: string;
    taskId: string;
    commitSha: string;
    runtimeEnvironment: string;
    frameworkDetected?: string;
    commandsExecuted: string[];
    exitCode?: number;
    status: 'PASSED' | 'FAILED' | 'COULD_NOT_EXECUTE' | 'NOT_CONFIGURED';
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    durationMs: number;
    sanitizedLogs: string;
  }): Promise<ITestExecutionDocument> {
    return TestExecutionModel.create(data);
  }

  /**
   * Audit log helper
   */
  private static async logAudit(params: {
    taskId: string;
    submissionId: string;
    actorId?: string;
    status: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await AuditLogModel.create({
        action: AuditAction.SANDBOX_TEST_COMPLETED,
        actorId: params.actorId || '000000000000000000000000',
        entityId: params.submissionId,
        entityType: 'PullRequestSubmission',
        details: {
          taskId: params.taskId,
          submissionId: params.submissionId,
          testStatus: params.status
        },
        ipAddress: params.ipAddress || '127.0.0.1'
      });
    } catch {
      // Never let audit log failure break primary test execution pipeline
    }
  }
}
