import { Octokit } from 'octokit';
import { GitHubInstallationModel } from '../models/GitHubInstallation.js';
import { decryptSecret } from '../utils/crypto.js';
import { AppError } from '../errors/AppError.js';

export type GitHubCITestStatus = 'PASSED' | 'FAILED' | 'PENDING' | 'IN_PROGRESS' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'ERROR';

export interface GitHubCheckRunDetail {
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl?: string;
  title?: string;
  summary?: string;
}

export interface GitHubWorkflowRunDetail {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  event: string;
}

export interface GitHubCIResult {
  status: GitHubCITestStatus;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  pendingChecks: number;
  inProgressChecks: number;
  checkRuns: GitHubCheckRunDetail[];
  workflowRuns?: GitHubWorkflowRunDetail[];
  summaryMessage?: string;
}

export interface GitHubRepoSummary {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch: string;
  htmlUrl: string;
  description?: string;
}

export interface GitHubIssueDetails {
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  labels: string[];
  assignees: string[];
  createdAt: string;
  author: string;
}

export interface GitHubPRDetails {
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  author: string;
  repoOwner: string;
  repoName: string;
  additions: number;
  deletions: number;
  changedFilesCount: number;
  mergeable: boolean | null;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}

export class GitHubService {
  /**
   * Factory to create an Octokit instance with a strict request timeout (15s)
   */
  static createOctokit(auth?: string): Octokit {
    return new Octokit({
      auth: auth || undefined,
      request: { timeout: 15000 }
    });
  }

  /**
   * Resolve an authenticated Octokit client, decrypting stored token or falling back gracefully
   */
  static async getOctokitClient(userId?: string): Promise<Octokit> {
    if (userId) {
      try {
        const installation = await GitHubInstallationModel.findOne({ userId }).select('+encryptedAccessToken');
        if (installation?.encryptedAccessToken) {
          const decryptedToken = decryptSecret(installation.encryptedAccessToken);
          return this.createOctokit(decryptedToken);
        }
      } catch {
        // Fall through to other tokens
      }
    }

    // Try finding any active installation in the workspace
    try {
      const anyInstallation = await GitHubInstallationModel.findOne({ encryptedAccessToken: { $exists: true } }).select('+encryptedAccessToken');
      if (anyInstallation?.encryptedAccessToken) {
        const decryptedToken = decryptSecret(anyInstallation.encryptedAccessToken);
        return this.createOctokit(decryptedToken);
      }
    } catch {
      // Fall through to GITHUB_TOKEN
    }

    return this.createOctokit(process.env.GITHUB_TOKEN || undefined);
  }

  static async getOctokitForUser(userId: string): Promise<Octokit> {
    return this.getOctokitClient(userId);
  }

  /**
   * List repositories accessible to the user
   */
  static async listUserRepositories(userId: string): Promise<GitHubRepoSummary[]> {
    const octokit = await this.getOctokitForUser(userId);
    try {
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 50
      });

      return data.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch,
        htmlUrl: repo.html_url,
        description: repo.description || undefined
      }));
    } catch (err: unknown) {
      this.handleOctokitError(err);
      return [];
    }
  }

  /**
   * Get single repository details
   */
  static async getRepository(owner: string, repo: string, userId: string): Promise<GitHubRepoSummary> {
    const octokit = await this.getOctokitForUser(userId);
    try {
      const { data } = await octokit.rest.repos.get({ owner, repo });
      return {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        owner: data.owner.login,
        isPrivate: data.private,
        defaultBranch: data.default_branch,
        htmlUrl: data.html_url,
        description: data.description || undefined
      };
    } catch (err) {
      throw this.handleOctokitError(err);
    }
  }

  /**
   * List branches for repository
   */
  static async listBranches(owner: string, repo: string, userId: string): Promise<string[]> {
    const octokit = await this.getOctokitForUser(userId);
    try {
      const { data } = await octokit.rest.repos.listBranches({ owner, repo, per_page: 50 });
      return data.map((b) => b.name);
    } catch (err) {
      throw this.handleOctokitError(err);
    }
  }

  /**
   * List open issues
   */
  static async listIssues(owner: string, repo: string, userId: string): Promise<GitHubIssueDetails[]> {
    const octokit = await this.getOctokitForUser(userId);
    try {
      const { data } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: 'open',
        per_page: 50
      });

      // Filter out Pull Requests (GitHub issues API returns PRs as issues)
      const issuesOnly = data.filter((item) => !item.pull_request);

      return issuesOnly.map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state,
        htmlUrl: issue.html_url,
        labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
        assignees: issue.assignees?.map((a) => a.login) || [],
        createdAt: issue.created_at,
        author: issue.user?.login || 'unknown'
      }));
    } catch (err) {
      throw this.handleOctokitError(err);
    }
  }

  /**
   * Get detailed issue information and comments for Task import
   */
  static async getIssue(owner: string, repo: string, issueNumber: number, userId?: string): Promise<GitHubIssueDetails> {
    const octokit = await this.getOctokitClient(userId);
    try {
      const { data } = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber
      });

      // Section 1: avoid fetching pull requests as issues if GitHub returns pull_request key
      if (data.pull_request) {
        throw AppError.badRequest(
          `#${issueNumber} is a pull request, not an issue. Please enter an issue number.`,
          'PULL_REQUEST_NOT_ALLOWED_AS_ISSUE'
        );
      }

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state,
        htmlUrl: data.html_url,
        labels: data.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
        assignees: data.assignees?.map((a) => a.login) || [],
        createdAt: data.created_at,
        author: data.user?.login || 'unknown'
      };
    } catch (err) {
      throw this.handleOctokitError(err);
    }
  }

  /**
   * Fetch Pull Request details including files and unified diffs
   */
  static async getPullRequest(owner: string, repo: string, prNumber: number, userId?: string): Promise<GitHubPRDetails> {
    const octokit = await this.getOctokitClient(userId);
    try {
      const prRes = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
      const pr = prRes.data;

      // Handle pagination safely with bounded iterator to prevent hanging
      const files: any[] = [];
      try {
        const iterator = octokit.paginate.iterator(octokit.rest.pulls.listFiles, {
          owner,
          repo,
          pull_number: prNumber,
          per_page: 100
        });
        for await (const { data: pageFiles } of iterator) {
          files.push(...pageFiles);
          if (files.length >= 200) break; // Safe cap
        }
      } catch {
        // Fallback to single page if pagination iterator fails
        if (files.length === 0) {
          const single = await octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: prNumber,
            per_page: 50
          });
          files.push(...(single.data || []));
        }
      }

      return {
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        state: pr.state,
        htmlUrl: pr.html_url,
        headSha: pr.head.sha,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        author: pr.user?.login || 'unknown',
        repoOwner: owner,
        repoName: repo,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFilesCount: pr.changed_files ?? files.length,
        mergeable: pr.mergeable,
        files: files.map((f: any) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch
        }))
      };
    } catch (err) {
      throw this.handleOctokitError(err);
    }
  }

  /**
   * Fetch repository directory tree structure
   */
  static async getRepositoryTree(owner: string, repo: string, branch = 'main', userId?: string): Promise<string[]> {
    const octokit = userId ? await this.getOctokitForUser(userId) : this.createOctokit();
    try {
      const { data } = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: '1'
      });
      return (data.tree || [])
        .filter((item) => item.type === 'blob')
        .map((item) => item.path || '')
        .filter(Boolean)
        .slice(0, 100); // Top 100 files for architectural context
    } catch {
      return [];
    }
  }

  /**
   * Fetch specific file content from repository safely
   */
  static async getFileContent(owner: string, repo: string, path: string, ref = 'main', userId?: string): Promise<string | null> {
    const octokit = userId ? await this.getOctokitForUser(userId) : this.createOctokit();
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref
      });

      if ('content' in data && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf8');
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Section 3.2: Read GitHub Checks, workflow runs & commit statuses for the exact head SHA
   * Honest states: PASSED (SUCCESS) | FAILED | PENDING | IN_PROGRESS | NOT_CONFIGURED | UNAVAILABLE | ERROR
   */
  static async getCommitCheckRunsAndStatuses(
    owner: string,
    repo: string,
    headSha: string,
    userId?: string
  ): Promise<GitHubCIResult> {
    try {
      const octokit = userId ? await this.getOctokitForUser(userId) : this.createOctokit();
      const [checksRes, combinedStatusRes, workflowRunsRes] = await Promise.all([
        octokit.rest.checks.listForRef({ owner, repo, ref: headSha }).catch(() => ({ data: { check_runs: [] } })),
        octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref: headSha }).catch(() => ({ data: { statuses: [] } })),
        octokit.rest.actions.listWorkflowRunsForRepo({ owner, repo, head_sha: headSha, per_page: 20 }).catch(() => ({ data: { workflow_runs: [] } }))
      ]);

      const checkRuns = checksRes.data?.check_runs || [];
      const statuses = combinedStatusRes.data?.statuses || [];
      const workflowRuns = workflowRunsRes.data?.workflow_runs || [];

      if (checkRuns.length === 0 && statuses.length === 0 && workflowRuns.length === 0) {
        return {
          status: 'NOT_CONFIGURED',
          totalChecks: 0,
          passedChecks: 0,
          failedChecks: 0,
          pendingChecks: 0,
          inProgressChecks: 0,
          checkRuns: [],
          workflowRuns: []
        };
      }

      let failed = 0;
      let passed = 0;
      let pending = 0;
      let inProgress = 0;

      for (const cr of checkRuns) {
        if (cr.status === 'in_progress') {
          inProgress++;
        } else if (cr.status === 'queued' || cr.status === 'waiting' || cr.status === 'pending' || cr.status === 'requested') {
          pending++;
        } else if (cr.status === 'completed') {
          if (cr.conclusion === 'success' || cr.conclusion === 'neutral' || cr.conclusion === 'skipped') {
            passed++;
          } else if (cr.conclusion === 'failure' || cr.conclusion === 'timed_out' || cr.conclusion === 'cancelled' || cr.conclusion === 'action_required') {
            failed++;
          } else {
            pending++;
          }
        }
      }

      for (const st of statuses) {
        if (st.state === 'pending') {
          pending++;
        } else if (st.state === 'success') {
          passed++;
        } else if (st.state === 'failure' || st.state === 'error') {
          failed++;
        }
      }

      const total = checkRuns.length + statuses.length;

      let finalStatus: GitHubCITestStatus = 'PASSED';
      if (failed > 0) {
        finalStatus = 'FAILED';
      } else if (inProgress > 0) {
        finalStatus = 'IN_PROGRESS';
      } else if (pending > 0) {
        finalStatus = 'PENDING';
      } else if (passed > 0) {
        finalStatus = 'PASSED';
      } else {
        finalStatus = 'NOT_CONFIGURED';
      }

      const mappedCheckRuns: GitHubCheckRunDetail[] = checkRuns.map((c: any) => ({
        name: c.name || 'Unnamed check',
        status: c.status || 'unknown',
        conclusion: c.conclusion || null,
        htmlUrl: c.html_url || undefined,
        title: c.output?.title || undefined,
        summary: c.output?.summary || undefined
      }));

      const mappedWorkflowRuns: GitHubWorkflowRunDetail[] = workflowRuns.map((w: any) => ({
        id: w.id,
        name: w.name || 'Workflow Run',
        status: w.status || 'unknown',
        conclusion: w.conclusion || null,
        htmlUrl: w.html_url,
        event: w.event || 'push'
      }));

      return {
        status: finalStatus,
        totalChecks: total || workflowRuns.length,
        passedChecks: passed,
        failedChecks: failed,
        pendingChecks: pending,
        inProgressChecks: inProgress,
        checkRuns: mappedCheckRuns,
        workflowRuns: mappedWorkflowRuns
      };
    } catch (err: any) {
      if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' || err?.status === 404) {
        return {
          status: 'NOT_CONFIGURED',
          totalChecks: 0,
          passedChecks: 0,
          failedChecks: 0,
          pendingChecks: 0,
          inProgressChecks: 0,
          checkRuns: [],
          workflowRuns: []
        };
      }
      return {
        status: 'ERROR',
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        pendingChecks: 0,
        inProgressChecks: 0,
        checkRuns: [],
        workflowRuns: [],
        summaryMessage: `Could not retrieve CI status from GitHub: ${err?.message || 'API request failed'}`
      };
    }
  }

  /**
   * Post automated bot comment to GitHub PR / Issue
   */
  static async postComment(owner: string, repo: string, issueOrPrNumber: number, body: string, userId?: string): Promise<void> {
    const octokit = userId ? await this.getOctokitForUser(userId) : this.createOctokit();
    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueOrPrNumber,
        body
      });
    } catch (err) {
      console.warn('[GitHubService] Could not post comment to PR/Issue:', err);
    }
  }

  private static handleOctokitError(err: unknown): AppError {
    if (err instanceof AppError) {
      return err;
    }
    const status = (err as { status?: number }).status;
    const message = (err as Error)?.message || 'Unknown GitHub API error';

    if (status === 404) {
      return AppError.notFound(`GitHub resource not found (404): ${message}`);
    }
    if (status === 401 || status === 403) {
      return AppError.forbidden(`GitHub API access denied or rate limit exceeded: ${message}`);
    }
    return AppError.badRequest(`GitHub API Error (${status || 'Network'}): ${message}`);
  }
}
