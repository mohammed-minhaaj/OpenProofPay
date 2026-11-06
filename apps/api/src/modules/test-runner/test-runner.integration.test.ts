import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from '../../test/setup.js';
import { UserModel } from '../../models/User.js';
import { ProjectModel } from '../../models/Project.js';
import { TaskModel } from '../../models/Task.js';
import { GitHubInstallationModel } from '../../models/GitHubInstallation.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { TestExecutionModel } from '../../models/TestExecution.js';
import { ProjectDetector } from './ProjectDetector.js';
import { OutputParser } from './OutputParser.js';
import { LogSanitizer } from './LogSanitizer.js';
import { TestRunnerService } from './test-runner.service.js';
import { MockSandboxRunner } from './MockSandboxRunner.js';
import { AIVerificationService } from '../ai-verification/ai-verification.service.js';
import { LLMProviderFactory } from '../ai-verification/providers/LLMProviderFactory.js';
import { env } from '../../config/env.js';
import {
  TaskStatus,
  UserRole,
  ProjectStatus,
  SubmissionStatus
} from '@openproofpay/shared';

const app = createApp();

describe('Phase 7: Automated Test Execution Service & Sandbox Infrastructure', () => {
  let employerUser: InstanceType<typeof UserModel>;
  let developerUser: InstanceType<typeof UserModel>;
  let employerToken: string;
  let developerToken: string;
  let project: InstanceType<typeof ProjectModel>;
  let repo: InstanceType<typeof GitHubRepositoryModel>;
  let task: InstanceType<typeof TaskModel>;
  let submission: InstanceType<typeof PullRequestSubmissionModel>;
  let mockRunner: MockSandboxRunner;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    mockRunner = new MockSandboxRunner();
    TestRunnerService.setRunnerOverride(mockRunner);
    LLMProviderFactory.setProvider(undefined);

    // 1. Create Employer
    employerUser = await UserModel.create({
      email: 'employer@testrunner.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Test Employer',
      role: UserRole.EMPLOYER
    });
    employerToken = jwt.sign(
      { userId: employerUser._id.toString(), role: UserRole.EMPLOYER, email: employerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 2. Create Developer
    developerUser = await UserModel.create({
      email: 'dev@testrunner.com',
      passwordHash: 'dummyhash12345678901234567890123456789012345678901234567890123456',
      name: 'Bob Dev',
      role: UserRole.DEVELOPER,
      githubConnected: true,
      githubUsername: 'bobdev'
    });
    developerToken = jwt.sign(
      { userId: developerUser._id.toString(), role: UserRole.DEVELOPER, email: developerUser.email },
      env.JWT_ACCESS_SECRET
    );

    // 3. Create Project & GitHub Repo
    const installation = await GitHubInstallationModel.create({
      installationId: 8888,
      accountLogin: 'openproofpay-org',
      accountType: 'Organization',
      userId: employerUser._id,
      encryptedAccessToken: 'dummy'
    });

    repo = await GitHubRepositoryModel.create({
      installationId: installation._id,
      githubRepoId: 9999,
      fullName: 'openproofpay-org/test-repo',
      owner: 'openproofpay-org',
      name: 'test-repo',
      private: false,
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/openproofpay-org/test-repo'
    });

    project = await ProjectModel.create({
      ownerId: employerUser._id,
      name: 'DevSecOps Sandbox Workspace',
      description: 'Project for automated testing integration',
      totalBudget: 5000,
      currency: 'USD',
      status: ProjectStatus.ACTIVE,
      githubRepoId: repo._id
    });

    // 4. Create Task
    task = await TaskModel.create({
      projectId: project._id,
      employerId: employerUser._id,
      assignedDeveloperId: developerUser._id,
      title: 'Core Algorithm Unit Tests',
      description: 'Implement core mathematical solver with full test suite',
      paymentAmount: 400,
      currency: 'USD',
      status: TaskStatus.SUBMITTED,
      minVerificationScore: 80,
      acceptanceCriteria: [
        { id: 'crit-tests', title: 'Automated Test Pass', description: 'Zero failures in container runner', mandatory: true }
      ]
    });

    // 5. Create PullRequestSubmission
    submission = await PullRequestSubmissionModel.create({
      taskId: task._id,
      developerId: developerUser._id,
      repositoryId: repo._id,
      prNumber: 42,
      prUrl: 'https://github.com/openproofpay-org/test-repo/pull/42',
      headSha: 'f87a321c890ab',
      baseBranch: 'main',
      headBranch: 'feat/algorithm',
      title: 'feat: add solver implementation and tests',
      status: SubmissionStatus.PENDING,
      additions: 120,
      deletions: 15,
      changedFilesCount: 3
    });
  });

  // ==========================================================================
  // GROUP 1: MULTI-LANGUAGE & FRAMEWORK DETECTION
  // ==========================================================================
  describe('1. Multi-Language Project & Test Framework Detection', () => {
    it('detects Node.js + Vitest from package.json dependencies and scripts', () => {
      const files = ['package.json', 'src/index.ts', 'tests/index.test.ts', 'tsconfig.json'];
      const detected = ProjectDetector.detectFromFiles(files, (f) => {
        if (f === 'package.json') {
          return JSON.stringify({
            name: 'vitest-app',
            scripts: { test: 'vitest run' },
            devDependencies: { vitest: '^2.0.0', typescript: '^5.0.0' }
          });
        }
        return null;
      });

      expect(detected.language).toBe('typescript');
      expect(detected.framework).toBe('vitest');
      expect(detected.hasTests).toBe(true);
      expect(detected.runtimeImage).toBe('node:20-alpine');
      expect(detected.testCommand).toContain('vitest');
    });

    it('detects JavaScript + Jest from package.json', () => {
      const files = ['package.json', 'src/app.js', 'tests/app.test.js'];
      const detected = ProjectDetector.detectFromFiles(files, (f) => {
        if (f === 'package.json') {
          return JSON.stringify({
            name: 'jest-app',
            devDependencies: { jest: '^29.0.0' },
            scripts: { test: 'jest' }
          });
        }
        return null;
      });

      expect(detected.language).toBe('javascript');
      expect(detected.framework).toBe('jest');
      expect(detected.hasTests).toBe(true);
      expect(detected.testCommand).toContain('jest');
    });

    it('detects Python + Pytest from pytest.ini and tests folder', () => {
      const files = ['pytest.ini', 'app.py', 'requirements.txt', 'tests/test_core.py'];
      const detected = ProjectDetector.detectFromFiles(files);

      expect(detected.language).toBe('python');
      expect(detected.framework).toBe('pytest');
      expect(detected.hasTests).toBe(true);
      expect(detected.runtimeImage).toBe('python:3.11-slim');
      expect(detected.testCommand).toBe('pytest -v');
    });

    it('detects Java + Maven JUnit from pom.xml', () => {
      const files = ['pom.xml', 'src/main/java/App.java', 'src/test/java/AppTest.java'];
      const detected = ProjectDetector.detectFromFiles(files);

      expect(detected.language).toBe('java');
      expect(detected.framework).toBe('junit');
      expect(detected.hasTests).toBe(true);
      expect(detected.testCommand).toContain('mvn test');
    });

    it('detects Java + Gradle JUnit from build.gradle', () => {
      const files = ['build.gradle', 'src/main/java/App.java'];
      const detected = ProjectDetector.detectFromFiles(files);

      expect(detected.language).toBe('java');
      expect(detected.framework).toBe('junit');
      expect(detected.hasTests).toBe(true);
      expect(detected.testCommand).toContain('gradle test');
    });

    it('detects C++ + CTest from CMakeLists.txt', () => {
      const files = ['CMakeLists.txt', 'src/main.cpp', 'tests/test.cpp'];
      const detected = ProjectDetector.detectFromFiles(files);

      expect(detected.language).toBe('cpp');
      expect(detected.framework).toBe('ctest');
      expect(detected.hasTests).toBe(true);
      expect(detected.testCommand).toContain('ctest');
    });

    it('correctly classifies repository with no test configuration as NOT_CONFIGURED', () => {
      const files = ['package.json', 'index.js', 'README.md'];
      const detected = ProjectDetector.detectFromFiles(files, (f) => {
        if (f === 'package.json') {
          return JSON.stringify({
            name: 'no-tests-app',
            scripts: { test: 'echo "Error: no test specified" && exit 1' }
          });
        }
        return null;
      });

      expect(detected.hasTests).toBe(false);
      expect(detected.framework).toBe('none');
    });
  });

  // ==========================================================================
  // GROUP 2: TEST RUNNER OUTPUT PARSING
  // ==========================================================================
  describe('2. Test Output Parsing (Vitest, Jest, Pytest, JUnit, CTest)', () => {
    it('parses Vitest / Jest outputs accurately with pass, fail, and skipped counts', () => {
      const vitestOutput = `
Tests:       2 failed, 14 passed, 1 skipped, 17 total
Snapshots:   0 total
Time:        1.42s
Ran all test suites.
`;
      const parsed = OutputParser.parse(vitestOutput, 'vitest');
      expect(parsed.totalTests).toBe(17);
      expect(parsed.passedTests).toBe(14);
      expect(parsed.failedTests).toBe(2);
      expect(parsed.skippedTests).toBe(1);
    });

    it('parses Pytest output line summary', () => {
      const pytestOutput = `
rootdir: /workspace
collected 10 items
tests/test_api.py ..........                                             [100%]
============================== 10 passed in 0.45s ==============================
`;
      const parsed = OutputParser.parse(pytestOutput, 'pytest');
      expect(parsed.totalTests).toBe(10);
      expect(parsed.passedTests).toBe(10);
      expect(parsed.failedTests).toBe(0);
    });

    it('parses JUnit / Maven build results with failures', () => {
      const mavenOutput = `
[INFO] Results:
[INFO] 
[INFO] Tests run: 25, Failures: 3, Errors: 0, Skipped: 2
[INFO] 
[ERROR] There are test failures.
`;
      const parsed = OutputParser.parse(mavenOutput, 'junit');
      expect(parsed.totalTests).toBe(25);
      expect(parsed.passedTests).toBe(20);
      expect(parsed.failedTests).toBe(3);
      expect(parsed.skippedTests).toBe(2);
    });

    it('parses CTest test summaries', () => {
      const ctestOutput = `
Test project /workspace/build
    Start 1: MathTests
1/2 Test #1: MathTests ........................   Passed    0.02 sec
    Start 2: NetworkTests
2/2 Test #2: NetworkTests .....................***Failed    0.05 sec

50% tests passed, 1 tests failed out of 2
`;
      const parsed = OutputParser.parse(ctestOutput, 'ctest');
      expect(parsed.totalTests).toBe(2);
      expect(parsed.passedTests).toBe(1);
      expect(parsed.failedTests).toBe(1);
    });
  });

  // ==========================================================================
  // GROUP 3: LOG SANITIZATION & SECRET SCRUBBING
  // ==========================================================================
  describe('3. Log Sanitization & DevSecOps Secret Scrubbing', () => {
    it('strips ANSI color and cursor codes from runner logs', () => {
      const ansiLog = '\x1B[32m✓ PASSED\x1B[39m \x1B[1mtest/auth.test.ts\x1B[22m';
      const clean = LogSanitizer.stripAnsi(ansiLog);
      expect(clean).toBe('✓ PASSED test/auth.test.ts');
      expect(clean).not.toContain('\x1B');
    });

    it('scrubs leaked API keys, tokens, and credentials from logs', () => {
      // Assemble mock test tokens dynamically so static analysis scanners do not treat test fixtures as leaked secrets
      const mockGithubToken = ['gh' + 'p', '1234567890abcdefghijklmnopqrstuvwxyz'].join('_');
      const mockOpenaiKey = ['sk', 'proj', 'abcdefghijklmnopqrstuvwxyz1234567890'].join('-');
      const mockGeminiKey = ['AI' + 'za', '1234567890abcdefghijklmnopqrstuvwxy'].join('');
      const mockDbPassword = 'superSecretP@ssword123';

      const dirtyLogs = `
Executing tests with env:
GITHUB_TOKEN=${mockGithubToken}
OPENAI_KEY=${mockOpenaiKey}
GEMINI_KEY=${mockGeminiKey}
JWT_AUTH=Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature
DB_URL=mongodb+srv://admin:${mockDbPassword}@cluster0.mongodb.net/test
`;
      const sanitized = LogSanitizer.scrubSecrets(dirtyLogs);

      expect(sanitized).not.toContain(mockGithubToken);
      expect(sanitized).toContain('[REDACTED_GITHUB_TOKEN]');

      expect(sanitized).not.toContain(mockOpenaiKey);
      expect(sanitized).toContain('[REDACTED_OPENAI_KEY]');

      expect(sanitized).not.toContain(mockGeminiKey);
      expect(sanitized).toContain('[REDACTED_GEMINI_KEY]');

      expect(sanitized).not.toContain(mockDbPassword);
      expect(sanitized).toContain('[REDACTED_DB_PASSWORD]');
    });

    it('truncates oversized logs safely preserving head and tail', () => {
      const hugeLog = 'HEAD_LOG\n' + 'A'.repeat(60000) + '\nTAIL_LOG';
      const truncated = LogSanitizer.truncate(hugeLog, 1000);

      expect(truncated.length).toBeLessThan(1500);
      expect(truncated).toContain('HEAD_LOG');
      expect(truncated).toContain('TAIL_LOG');
      expect(truncated).toContain('[... TRUNCATED:');
    });
  });

  // ==========================================================================
  // GROUP 4: HONEST 4-STATE CLASSIFICATION (PASSED, FAILED, COULD_NOT_EXECUTE, NOT_CONFIGURED)
  // ==========================================================================
  describe('4. Honest 4-State Classification & Sandbox Constraints', () => {
    it('classifies successful test suite as PASSED with accurate counts', async () => {
      mockRunner.setMockResult({
        exitCode: 0,
        stdout: `
Tests:       8 passed, 8 total
Time:        0.85s
`
      });

      const files = {
        'package.json': JSON.stringify({
          scripts: { test: 'vitest run' },
          devDependencies: { vitest: '^2.0.0' }
        }),
        'tests/solver.test.ts': 'test("solver", () => {});'
      };

      const result = await TestRunnerService.executeSubmissionTests(submission._id.toString(), {
        filesOverride: files
      });

      expect(result.status).toBe('PASSED');
      expect(result.exitCode).toBe(0);
      expect(result.passedTests).toBe(8);
      expect(result.failedTests).toBe(0);
      expect(result.totalTests).toBe(8);
    });

    it('classifies failed test suite as FAILED with exitCode != 0', async () => {
      mockRunner.setMockResult({
        exitCode: 1,
        stdout: `
Tests:       2 failed, 6 passed, 8 total
Time:        1.2s
`
      });

      const files = {
        'package.json': JSON.stringify({
          scripts: { test: 'vitest run' },
          devDependencies: { vitest: '^2.0.0' }
        })
      };

      const result = await TestRunnerService.executeSubmissionTests(submission._id.toString(), {
        filesOverride: files
      });

      expect(result.status).toBe('FAILED');
      expect(result.exitCode).toBe(1);
      expect(result.failedTests).toBe(2);
      expect(result.passedTests).toBe(6);
    });

    it('classifies unconfigured repository as NOT_CONFIGURED and NEVER as PASSED', async () => {
      const files = {
        'README.md': '# Just documentation without tests',
        'src/main.js': 'console.log("no tests");'
      };

      const result = await TestRunnerService.executeSubmissionTests(submission._id.toString(), {
        filesOverride: files
      });

      expect(result.status).toBe('NOT_CONFIGURED');
      expect(result.status).not.toBe('PASSED');
      expect(result.totalTests).toBe(0);
      expect(result.sanitizedLogs).toContain('No test configuration');
    });

    it('classifies sandbox timeout as COULD_NOT_EXECUTE and NEVER as PASSED', async () => {
      mockRunner.setMockResult({
        exitCode: 124,
        timedOut: true,
        stdout: 'Infinite loop running...',
        rawLogs: 'Timeout reached while executing test suite'
      });

      const files = {
        'package.json': JSON.stringify({
          scripts: { test: 'vitest run' },
          devDependencies: { vitest: '^2.0.0' }
        })
      };

      const result = await TestRunnerService.executeSubmissionTests(submission._id.toString(), {
        filesOverride: files,
        timeoutMs: 1000
      });

      expect(result.status).toBe('COULD_NOT_EXECUTE');
      expect(result.status).not.toBe('PASSED');
      expect(result.sanitizedLogs).toContain('SANDBOX TIMEOUT');
    });

    it('classifies unavailable Docker daemon as COULD_NOT_EXECUTE', async () => {
      mockRunner.setMockAvailable(false);

      const files = {
        'package.json': JSON.stringify({
          scripts: { test: 'vitest run' },
          devDependencies: { vitest: '^2.0.0' }
        })
      };

      const result = await TestRunnerService.executeSubmissionTests(submission._id.toString(), {
        filesOverride: files
      });

      expect(result.status).toBe('COULD_NOT_EXECUTE');
      expect(result.sanitizedLogs).toContain('Docker daemon is unavailable');
    });
  });

  // ==========================================================================
  // GROUP 5: API ENDPOINTS & AI VERIFICATION FEEDBACK
  // ==========================================================================
  describe('5. REST Endpoints & Pipeline Integration', () => {
    it('POST /api/tasks/:taskId/test triggers test runner and records TestExecution', async () => {
      mockRunner.setMockResult({
        exitCode: 0,
        stdout: 'Tests: 12 passed, 12 total'
      });

      const files = {
        'package.json': JSON.stringify({
          scripts: { test: 'vitest run' },
          devDependencies: { vitest: '^2.0.0' }
        }),
        'tests/unit.test.ts': 'test("unit", () => {})'
      };

      const res = await request(app)
        .post(`/api/tasks/${task._id}/test`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          submissionId: submission._id.toString(),
          filesOverride: files
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.commitSha).toBe(submission.headSha);
      expect(res.body.data.status).toBe('PASSED');
      expect(res.body.data.totalTests).toBe(12);

      // Verify persisted in DB
      const dbRecord = await TestExecutionModel.findOne({ submissionId: submission._id });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord!.status).toBe('PASSED');
    });

    it('GET /api/tasks/:taskId/test-execution retrieves the latest test record', async () => {
      await TestExecutionModel.create({
        submissionId: submission._id,
        taskId: task._id,
        commitSha: submission.headSha,
        runtimeEnvironment: 'node:20-alpine',
        frameworkDetected: 'vitest',
        commandsExecuted: ['npx vitest run'],
        exitCode: 0,
        status: 'PASSED',
        totalTests: 15,
        passedTests: 15,
        failedTests: 0,
        skippedTests: 0,
        durationMs: 400,
        sanitizedLogs: 'All 15 tests passed cleanly.'
      });

      const res = await request(app)
        .get(`/api/tasks/${task._id}/test-execution`)
        .set('Authorization', `Bearer ${developerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalTests).toBe(15);
      expect(res.body.data.status).toBe('PASSED');
    });

    it('GET /api/submissions/:submissionId/test-execution retrieves submission record', async () => {
      await TestExecutionModel.create({
        submissionId: submission._id,
        taskId: task._id,
        commitSha: submission.headSha,
        runtimeEnvironment: 'python:3.11-slim',
        frameworkDetected: 'pytest',
        commandsExecuted: ['pytest -v'],
        exitCode: 1,
        status: 'FAILED',
        totalTests: 6,
        passedTests: 4,
        failedTests: 2,
        skippedTests: 0,
        durationMs: 350,
        sanitizedLogs: '2 failed, 4 passed in 0.35s'
      });

      const res = await request(app)
        .get(`/api/submissions/${submission._id}/test-execution`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('FAILED');
      expect(res.body.data.failedTests).toBe(2);
    });

    it('AIVerificationService seamlessly incorporates TestExecution into verification report', async () => {
      // 1. Pre-seed a passing test execution
      await TestExecutionModel.create({
        submissionId: submission._id,
        taskId: task._id,
        commitSha: submission.headSha,
        runtimeEnvironment: 'node:20-alpine',
        frameworkDetected: 'vitest',
        commandsExecuted: ['npx vitest run'],
        exitCode: 0,
        status: 'PASSED',
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        durationMs: 500,
        sanitizedLogs: 'Tests: 10 passed, 10 total'
      });

      // 2. Trigger AI Verification
      const report = await AIVerificationService.verifySubmission(
        submission._id.toString(),
        employerUser._id.toString(),
        UserRole.EMPLOYER
      );

      expect(report.scoreBreakdown?.testExecutionScore).toBe(20); // 20 points for evaluated tests (v2 formula: 40/20/20/20)
      expect(report.overallScore).toBeGreaterThanOrEqual(80);
      expect(report.status).toBe('PASSED');
    });
  });
});
