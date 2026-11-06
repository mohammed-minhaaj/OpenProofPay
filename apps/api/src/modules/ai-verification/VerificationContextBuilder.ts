import { TaskModel } from '../../models/Task.js';
import { ProjectModel } from '../../models/Project.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { IPullRequestSubmissionDocument } from '../../models/PullRequestSubmission.js';
import { TestExecutionModel } from '../../models/TestExecution.js';
import { GitHubService } from '../../services/GitHubService.js';
import { AppError } from '../../errors/AppError.js';
import { PromptSecurity } from './PromptSecurity.js';

export interface VerificationContext {
  task: {
    id: string;
    title: string;
    description: string;
    githubIssueNumber?: number;
    githubIssueUrl?: string;
    acceptanceCriteria: Array<{
      id: string;
      title?: string;
      description: string;
      mandatory: boolean;
      category?: string;
    }>;
  };
  issue?: {
    number: number;
    title: string;
    body: string;
    labels: string[];
  };
  pullRequest: {
    number: number;
    title: string;
    body: string;
    headSha: string;
    baseBranch: string;
    headBranch: string;
    author: string;
  };
  changedFiles: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
  unifiedDiff: string;
  validFilePaths: Set<string>;
  includedFiles: string[];
  omittedFiles: string[];
  tokenBudget: number;
  ciTestStatus?: 'PASSED' | 'FAILED' | 'PENDING' | 'IN_PROGRESS' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'ERROR';
  ciDetails?: any;
  surroundingContext?: Record<string, string>;
  repositoryStructure?: string[];
  relatedTests?: Record<string, string>;
  readmeDocumentation?: string;
  testExecution?: {
    status: string;
    exitCode?: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    sanitizedLogs?: string;
  };
}

export class VerificationContextBuilder {
  /**
   * Assemble rich, selective verification context for a PR submission including surrounding code,
   * directory structure, and tests so the AI evaluates changes within the true repository context.
   */
  static async buildContext(submission: IPullRequestSubmissionDocument): Promise<VerificationContext> {
    const task = await TaskModel.findById(submission.taskId);
    if (!task) {
      throw AppError.notFound('Associated milestone task not found');
    }

    const project = await ProjectModel.findById(task.projectId);
    if (!project) {
      throw AppError.notFound('Parent project not found');
    }

    const linkedRepo = project.githubRepoId
      ? await GitHubRepositoryModel.findById(project.githubRepoId)
      : null;

    let issueDetails: { number: number; title: string; body: string; labels: string[] } | undefined;
    let changedFiles: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }> = [];
    let prAuthor = '';
    let prTitle = submission.title || `PR #${submission.prNumber}`;
    let prBody = submission.body || '';

    const surroundingContext: Record<string, string> = {};
    let repositoryStructure: string[] = [];
    const relatedTests: Record<string, string> = {};
    let readmeDocumentation: string | undefined;

    // Section 3.1: Configurable Token Budget & Relevance Ranking
    const tokenBudget = process.env.AI_TOKEN_BUDGET ? parseInt(process.env.AI_TOKEN_BUDGET, 10) : 32000;
    const maxChars = tokenBudget * 4;
    let currentChars = 0;
    const includedFiles: string[] = [];
    const omittedFiles: string[] = [];

    // 1. Fetch live PR details, CI check results, and surrounding context if repository is linked
    let ciTestStatus: 'PASSED' | 'FAILED' | 'PENDING' | 'IN_PROGRESS' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'ERROR' = 'NOT_CONFIGURED';
    let ciDetails: any = undefined;

    if (linkedRepo) {
      try {
        const pr = await GitHubService.getPullRequest(
          linkedRepo.owner,
          linkedRepo.name,
          submission.prNumber,
          task.employerId.toString()
        );
        prTitle = pr.title || prTitle;
        prBody = pr.body || prBody;
        prAuthor = pr.author || '';
        changedFiles = pr.files || [];
      } catch {
        if (submission.files && submission.files.length > 0) {
          changedFiles = submission.files;
        }
      }

      // Section 3.2: Read GitHub Checks, workflow runs & commit statuses for the exact head SHA
      if (submission.headSha) {
        try {
          const ci = await GitHubService.getCommitCheckRunsAndStatuses(
            linkedRepo.owner,
            linkedRepo.name,
            submission.headSha,
            task.employerId.toString()
          );
          ciTestStatus = ci.status;
          ciDetails = ci;
        } catch {
          ciTestStatus = 'NOT_CONFIGURED';
        }
      }

      // Fetch linked issue details if task has issueNumber
      if (task.githubIssueNumber) {
        try {
          const issue = await GitHubService.getIssue(
            linkedRepo.owner,
            linkedRepo.name,
            task.githubIssueNumber,
            task.employerId.toString()
          );
          if (issue) {
            issueDetails = {
              number: issue.number,
              title: issue.title,
              body: issue.body,
              labels: issue.labels
            };
          }
        } catch {
          // Non-blocking fallback
        }
      }

      // Fetch repository tree
      try {
        repositoryStructure = await GitHubService.getRepositoryTree(
          linkedRepo.owner,
          linkedRepo.name,
          submission.baseBranch || 'main',
          task.employerId.toString()
        );
      } catch {
        repositoryStructure = [];
      }

      // Relevance ranking for files: 1. changed files, 2. tests, 3. configs
      for (const f of changedFiles) {
        if (currentChars < maxChars) {
          try {
            const content = await GitHubService.getFileContent(
              linkedRepo.owner,
              linkedRepo.name,
              f.filename,
              submission.headSha || submission.baseBranch || 'main',
              task.employerId.toString()
            );
            if (content) {
              const snippet = content.split('\n').slice(0, 250).join('\n');
              surroundingContext[f.filename] = snippet;
              currentChars += snippet.length;
              includedFiles.push(f.filename);
            }
          } catch {
            includedFiles.push(f.filename);
          }
        } else {
          omittedFiles.push(f.filename);
        }
      }

      // Fetch README if within budget
      if (currentChars + 2000 < maxChars) {
        try {
          const readme = await GitHubService.getFileContent(
            linkedRepo.owner,
            linkedRepo.name,
            'README.md',
            submission.baseBranch || 'main',
            task.employerId.toString()
          );
          if (readme) {
            readmeDocumentation = readme.split('\n').slice(0, 100).join('\n');
            currentChars += readmeDocumentation.length;
            includedFiles.push('README.md');
          }
        } catch {
          // Non-blocking
        }
      }
    }

    // 2. Build verified file paths set from diff
    const validFilePaths = new Set<string>();
    changedFiles.forEach((f) => {
      validFilePaths.add(f.filename);
      const normalized = f.filename.replace(/^\/+/, '');
      validFilePaths.add(normalized);
    });

    // 3. Assemble unified diff with line numbers annotated on each diff line
    let unifiedDiff = '';
    for (const f of changedFiles) {
      unifiedDiff += `diff --git a/${f.filename} b/${f.filename}\n`;
      unifiedDiff += `--- a/${f.filename}\n`;
      unifiedDiff += `+++ b/${f.filename}\n`;
      if (f.patch) {
        unifiedDiff += `${this.annotateDiffPatch(f.patch)}\n\n`;
      } else if (surroundingContext[f.filename]) {
        unifiedDiff += `[Full file content at head SHA retrieved (patch omitted by GitHub)]:\n${surroundingContext[f.filename]}\n\n`;
      } else {
        unifiedDiff += `[Binary file, omitted patch, or file content unavailable from GitHub]\n\n`;
      }
    }

    if (validFilePaths.size === 0) {
      unifiedDiff = 'No file changes or unified diffs recorded for this submission.';
    }

    // 4. Look up fact-based test execution results for the exact commit SHA
    const testExecution = await TestExecutionModel.findOne({
      submissionId: submission._id,
      commitSha: submission.headSha
    });

    const testExecutionData = testExecution
      ? {
          status: testExecution.status,
          exitCode: testExecution.exitCode,
          totalTests: testExecution.totalTests,
          passedTests: testExecution.passedTests,
          failedTests: testExecution.failedTests,
          sanitizedLogs: testExecution.sanitizedLogs?.substring(0, 4000)
        }
      : undefined;

    // Fallback: If issue was not reachable via GitHub API, populate directly from task title and description
    if (!issueDetails) {
      issueDetails = {
        number: task.githubIssueNumber || 1,
        title: task.title,
        body: task.description,
        labels: []
      };
    }

    // Extract individual criteria from issue description if none were manually configured
    let criteria: Array<{
      id: string;
      title?: string;
      description: string;
      mandatory: boolean;
      category?: string;
    }> = (task.acceptanceCriteria || []).map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      mandatory: c.mandatory !== false,
      category: c.category
    }));

    if (criteria.length === 0) {
      criteria = this.extractCriteriaFromIssue(task.title, issueDetails.body || task.description);
    }

    return {
      task: {
        id: task._id.toString(),
        title: task.title,
        description: task.description,
        githubIssueNumber: task.githubIssueNumber,
        githubIssueUrl: task.githubIssueUrl,
        acceptanceCriteria: criteria
      },
      issue: issueDetails,
      pullRequest: {
        number: submission.prNumber,
        title: prTitle,
        body: prBody,
        headSha: submission.headSha,
        baseBranch: submission.baseBranch || 'main',
        headBranch: submission.headBranch || 'feature',
        author: prAuthor
      },
      changedFiles,
      unifiedDiff,
      validFilePaths,
      includedFiles,
      omittedFiles,
      tokenBudget,
      ciTestStatus,
      ciDetails,
      surroundingContext,
      repositoryStructure,
      relatedTests,
      readmeDocumentation,
      testExecution: testExecutionData
    };
  }

  /**
   * Annotate each line in a unified diff patch with its destination file line number
   */
  static annotateDiffPatch(patch: string): string {
    if (!patch) return '';
    const rawLines = patch.split('\n');
    let output = '';
    let currentDestLine = 0;

    for (const line of rawLines) {
      const hunkHeaderMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
      if (hunkHeaderMatch) {
        currentDestLine = parseInt(hunkHeaderMatch[3]!, 10);
        output += `${line}\n`;
        continue;
      }

      if (line.startsWith('+')) {
        output += `+ L${String(currentDestLine).padStart(4, ' ')} | ${line.slice(1)}\n`;
        currentDestLine++;
      } else if (line.startsWith('-')) {
        output += `-       | ${line.slice(1)}\n`;
      } else {
        output += `  L${String(currentDestLine).padStart(4, ' ')} | ${line.startsWith(' ') ? line.slice(1) : line}\n`;
        currentDestLine++;
      }
    }
    return output;
  }

  /**
   * Extract individual testable requirements from GitHub issue title & markdown body
   */
  static extractCriteriaFromIssue(title: string, body: string): Array<{
    id: string;
    title: string;
    description: string;
    mandatory: boolean;
    category?: string;
  }> {
    const criteria: Array<{ id: string; title: string; description: string; mandatory: boolean; category?: string }> = [];
    if (!body || body.trim().length === 0) {
      return [{
        id: 'req-1',
        title: title || 'Primary Feature Implementation',
        description: `Implement the requested functionality described in issue: ${title}`,
        mandatory: true,
        category: 'FUNCTIONAL'
      }];
    }

    const rawLines = body.split('\n');
    let idx = 1;

    for (const rawLine of rawLines) {
      const line = rawLine.trim();

      // Checkbox list items: - [ ] or - [x]
      const checkboxMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
      if (checkboxMatch && checkboxMatch[2]) {
        criteria.push({
          id: `req-${idx}`,
          title: `Acceptance Criterion #${idx}`,
          description: checkboxMatch[2].trim(),
          mandatory: true,
          category: 'FUNCTIONAL'
        });
        idx++;
        continue;
      }

      // Numbered list items: 1. or 1)
      const numberedMatch = line.match(/^\d+[\.)]\s*(.+)/);
      if (numberedMatch && numberedMatch[1] && numberedMatch[1].length > 10) {
        criteria.push({
          id: `req-${idx}`,
          title: `Requirement #${idx}`,
          description: numberedMatch[1].trim(),
          mandatory: true,
          category: 'FUNCTIONAL'
        });
        idx++;
        continue;
      }

      // Bullet items with bold prefixes: - **Title**: Description
      const bulletMatch = line.match(/^[-*]\s*(?:\*\*(.+?)\*\*[:\s]*)?(.+)/);
      if (bulletMatch && (bulletMatch[1] || bulletMatch[2]) && (bulletMatch[2] || '').length > 15) {
        const itemTitle = bulletMatch[1]?.trim() || `Requirement #${idx}`;
        const itemDesc = bulletMatch[2]?.trim() || '';
        criteria.push({
          id: `req-${idx}`,
          title: itemTitle,
          description: itemDesc,
          mandatory: true,
          category: 'FUNCTIONAL'
        });
        idx++;
      }
    }

    if (criteria.length === 0) {
      criteria.push({
        id: 'req-1',
        title: title || 'Issue Scope Implementation',
        description: body.slice(0, 400).trim(),
        mandatory: true,
        category: 'FUNCTIONAL'
      });
    }

    return criteria.slice(0, 8); // Safe cap at top 8 requirements
  }

  /**
   * Format the assembled context into a prompt comparing the Original GitHub Issue
   * directly against the Developer's PR implementation without requiring manual criteria.
   */
  static formatPrompt(ctx: VerificationContext): string {
    const {
      task,
      issue,
      pullRequest,
      unifiedDiff,
      surroundingContext,
      repositoryStructure,
      readmeDocumentation,
      testExecution
    } = ctx;

    const issueTitle = issue?.title || task.title;
    const issueBody = issue?.body || task.description;
    const issueNum = issue?.number || task.githubIssueNumber || 'N/A';
    const issueLabels = issue?.labels && issue.labels.length > 0 ? issue.labels.join(', ') : 'None';

    let prompt = `## ORIGINAL GITHUB ISSUE SPECIFICATION (PRIMARY SOURCE OF TRUTH):\n`;
    prompt += `Issue Number: #${issueNum}\n`;
    prompt += `Issue Title: ${issueTitle}\n`;
    prompt += `Labels: ${issueLabels}\n\n`;
    prompt += `Full Issue Description & Requirements:\n`;
    prompt += PromptSecurity.wrapUntrustedContent(issueBody, 'github_issue');
    prompt += `\n\n`;

    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
      prompt += `## EXTRACTED ISSUE REQUIREMENTS / ACCEPTANCE CRITERIA CHECKLIST:\n`;
      task.acceptanceCriteria.forEach((crit, i) => {
        prompt += `- [ID: ${crit.id}] **${crit.title || `Requirement #${i + 1}`}**: ${crit.description}\n`;
      });
      prompt += `\n`;
    }

    prompt += `## SUBMITTED PULL REQUEST UNDER REVIEW (DEVELOPER IMPLEMENTATION):\n`;
    prompt += PromptSecurity.wrapUntrustedContent(
      `PR #${pullRequest.number}: ${pullRequest.title}\nAuthor: @${pullRequest.author}\nHead Commit SHA: ${pullRequest.headSha}\nBranches: ${pullRequest.headBranch} -> ${pullRequest.baseBranch}\n\nPR Description:\n${pullRequest.body}`,
      'pr_metadata'
    );
    prompt += `\n\n`;

    if (readmeDocumentation) {
      prompt += `## REPOSITORY OVERVIEW & CONTEXT (README):\n`;
      prompt += PromptSecurity.wrapUntrustedContent(readmeDocumentation, 'repository_readme');
      prompt += `\n\n`;
    }

    if (repositoryStructure && repositoryStructure.length > 0) {
      prompt += `## REPOSITORY DIRECTORY STRUCTURE:\n`;
      prompt += `\`\`\`\n${repositoryStructure.slice(0, 50).join('\n')}\n\`\`\`\n\n`;
    }

    if (surroundingContext && Object.keys(surroundingContext).length > 0) {
      prompt += `## SURROUNDING REPOSITORY FILES CONTEXT:\n`;
      for (const [filePath, content] of Object.entries(surroundingContext)) {
        prompt += `### File: ${filePath}\n`;
        prompt += PromptSecurity.wrapUntrustedContent(content, 'surrounding_file');
        prompt += `\n\n`;
      }
    }

    prompt += `## ACTUAL CODE CHANGES / UNIFIED DIFF TO EVALUATE:\n`;
    prompt += PromptSecurity.wrapUntrustedContent(unifiedDiff, 'code_diff');
    prompt += `\n\n`;

    if (testExecution) {
      prompt += `## DETERMINISTIC SANDBOX TEST EXECUTION RESULTS (FACT-BASED LOGS):\n`;
      prompt += `Test Status: ${testExecution.status}\n`;
      prompt += `Exit Code: ${testExecution.exitCode ?? 'N/A'}\n`;
      prompt += `Total Tests: ${testExecution.totalTests} | Passed: ${testExecution.passedTests} | Failed: ${testExecution.failedTests}\n`;
      if (testExecution.sanitizedLogs) {
        prompt += `Logs:\n\`\`\`\n${testExecution.sanitizedLogs}\n\`\`\`\n`;
      }
      prompt += `\n`;
    } else {
      prompt += `## DETERMINISTIC SANDBOX TEST EXECUTION RESULTS:\nTest Execution: TESTS_NOT_RUN (Docker container testing was not executed or unavailable on host. Evaluate code implementation on merits.)\n\n`;
    }

    prompt += `## DIRECT ISSUE VS. PR VERIFICATION INSTRUCTIONS:
Compare what the GitHub issue requests directly against what the developer actually implemented in the PR.
You must analyze:
1. Issue Understanding: Extract what problem the issue describes, what functionality needs to be implemented, what behavior is expected, and what constraints or edge cases are mentioned. Do not invent requirements that the issue does not contain.
2. PR Implementation: Evaluate whether the PR addresses the problem described in the issue, whether the required functionality is implemented, and what changed files/lines deliver it.
3. Missing Functionality: Identify any requested features or edge cases from the issue that were omitted.
4. Correctness & Bug Detection: Look for logical flaws, edge case regressions, bad conditions, and unintended side effects in the actual diff.
5. Security Analysis: Check for injection (SQL/NoSQL/command), hardcoded secrets, unsafe deserialization, or improper access.
6. Tests: Evaluate whether existing or added tests provide evidence that the implementation works.
7. Resolution Verdict:
   - FULLY_ADDRESSED: The PR completely solves the problem described in the issue with no missing requirements.
   - PARTIALLY_ADDRESSED: The PR implements part of the issue requirements, but some functionality, edge cases, or tests are missing.
   - NOT_ADDRESSED: The PR does not meaningfully solve or implement the requested issue functionality.
   - UNABLE_TO_DETERMINE: Code diff is incomplete, binary, or insufficient to evaluate against the issue.

Respond STRICTLY with a valid JSON object matching this schema:
{
  "overallAssessment": "<concise executive summary comparing what the issue asked for vs what the PR delivered>",
  "resolutionVerdict": "FULLY_ADDRESSED" | "PARTIALLY_ADDRESSED" | "NOT_ADDRESSED" | "UNABLE_TO_DETERMINE",
  "recommendation": "ACCEPT" | "REQUEST_CHANGES" | "REJECT",
  "issueAnalysis": {
    "issueSummary": "<summary of what the GitHub issue requested>",
    "problemStatement": "<the exact problem described in the issue>",
    "expectedBehavior": "<expected behavior, constraints, and edge cases requested>"
  },
  "implementationAnalysis": {
    "prSummary": "<summary of what the PR actually implemented>",
    "changesSummary": "<overview of files modified and approach taken in code>"
  },
  "requirementAnalysis": [
    {
      "title": "<finding title for this requirement>",
      "requirement": "<what was requested in the issue>",
      "satisfied": true|false,
      "status": "SATISFIED" | "PARTIALLY_SATISFIED" | "UNSATISFIED" | "UNABLE_TO_DETERMINE",
      "explanation": "<detailed explanation of how PR implementation matches or fails this requirement>",
      "missingFunctionality": "<missing functionality or edge case, if any>",
      "suggestedCorrection": "<suggested correction if unsatisfied or partial, if any>",
      "evidence": [
        {
          "filePath": "<file path from diff>",
          "lineStart": <number>,
          "lineEnd": <number>,
          "explanation": "<supporting code evidence explanation>",
          "quote": "<exact code line or snippet from diff>"
        }
      ]
    }
  ],
  "criticalIssues": [
    {
      "filePath": "<file path from diff>",
      "lineNumber": <number>,
      "message": "<description of blocker, bug, or regression>"
    }
  ],
  "majorIssues": [
    {
      "filePath": "<file path from diff>",
      "lineNumber": <number>,
      "message": "<description of major defect or unhandled edge case>"
    }
  ],
  "minorSuggestions": [
    {
      "filePath": "<file path from diff>",
      "lineNumber": <number>,
      "message": "<constructive code improvement suggestion>"
    }
  ],
  "securityFindings": [
    {
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "type": "<VULNERABILITY_TYPE>",
      "message": "<details of vulnerability>",
      "filePath": "<file path>",
      "lineNumber": <number>,
      "recommendation": "<remediation guidance>"
    }
  ],
  "positiveFindings": ["<noteworthy strengths of implementation>"],
  "missingFunctionality": ["<unimplemented feature 1 from issue>"],
  "codeQualityFindings": ["<quality observation 1>"],
  "performanceFindings": ["<performance observation 1>"],
  "testCoverageAssessment": "<evaluation of test adequacy>",
  "confidenceLevel": "HIGH" | "MEDIUM" | "LOW"
}`;

    return prompt;
  }
}
