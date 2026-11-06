import { generateSignedOAuthState, verifySignedOAuthState, encryptSecret } from '../../utils/crypto.js';
import { GitHubInstallationModel } from '../../models/GitHubInstallation.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { ProjectModel } from '../../models/Project.js';
import { UserModel } from '../../models/User.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { AppError } from '../../errors/AppError.js';
import { env } from '../../config/env.js';
import { Octokit } from 'octokit';
import { AuditAction } from '@openproofpay/shared';

export class GitHubModuleService {
  /**
   * Generate secure OAuth authorization URL with cryptographic CSRF state
   */
  static getConnectUrl(userId: string): { url: string; state: string } {
    const clientId = env.GITHUB_CLIENT_ID || 'dummy_github_client_id';
    const state = generateSignedOAuthState(userId);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${env.API_BASE_URL}/api/github/callback`,
      scope: 'repo,read:user,user:email',
      state
    });

    return {
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
      state
    };
  }

  /**
   * Handle GitHub OAuth callback: verify state, exchange code, encrypt token at rest
   */
  static async handleCallback(code: string, state: string, ipAddress?: string): Promise<{ success: true; username: string }> {
    const userId = verifySignedOAuthState(state);

    const clientId = env.GITHUB_CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw AppError.internal('GitHub Client credentials not configured on the server');
    }

    // Exchange authorization code for access token with GitHub
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenData.access_token) {
      throw AppError.badRequest(
        tokenData.error_description || 'Failed to obtain access token from GitHub',
        'GITHUB_OAUTH_FAILED'
      );
    }

    // Fetch user profile from GitHub with access token
    const octokit = new Octokit({ auth: tokenData.access_token });
    const { data: ghUser } = await octokit.rest.users.getAuthenticated();

    // Encrypt token at rest with AES-256-GCM (Rule 4 & 5)
    const encryptedAccessToken = encryptSecret(tokenData.access_token);

    // Save or update GitHubInstallation record
    await GitHubInstallationModel.findOneAndUpdate(
      { userId },
      {
        userId,
        installationId: ghUser.id,
        accountLogin: ghUser.login,
        accountType: ghUser.type === 'Organization' ? 'Organization' : 'User',
        targetId: ghUser.id,
        encryptedAccessToken,
        permissions: { repo: 'write', user: 'read' }
      },
      { upsert: true, new: true }
    );

    // Update User model
    await UserModel.findByIdAndUpdate(userId, {
      githubConnected: true,
      githubUsername: ghUser.login
    });

    // Log security audit event
    await AuditLogModel.create({
      actorId: userId,
      action: AuditAction.USER_LOGIN,
      resourceType: 'GitHubInstallation',
      resourceId: ghUser.login,
      ipAddress,
      metadata: { action: 'GITHUB_OAUTH_CONNECTED', githubLogin: ghUser.login }
    });

    return { success: true, username: ghUser.login };
  }

  /**
   * Disconnect GitHub account and revoke stored token
   */
  static async disconnect(userId: string, ipAddress?: string): Promise<void> {
    await GitHubInstallationModel.findOneAndDelete({ userId });
    await UserModel.findByIdAndUpdate(userId, {
      githubConnected: false,
      githubUsername: undefined
    });

    await AuditLogModel.create({
      actorId: userId,
      action: AuditAction.USER_LOGIN,
      resourceType: 'GitHubInstallation',
      resourceId: userId,
      ipAddress,
      metadata: { action: 'GITHUB_OAUTH_DISCONNECTED' }
    });
  }

  /**
   * Bind and validate a GitHub repository to an existing Project
   */
  static async bindRepositoryToProject(
    projectId: string,
    repoData: { githubRepoId: number; fullName: string; owner: string; name: string; isPrivate: boolean; htmlUrl: string },
    employerId: string
  ) {
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      throw AppError.notFound('Project not found');
    }

    if (project.ownerId.toString() !== employerId) {
      throw AppError.forbidden('Only the employer owning this project can bind repositories');
    }

    const installation = await GitHubInstallationModel.findOne({ userId: employerId });
    if (!installation) {
      throw AppError.badRequest('Please connect your GitHub account before binding a repository');
    }

    const repo = await GitHubRepositoryModel.findOneAndUpdate(
      { githubRepoId: repoData.githubRepoId },
      {
        installationId: installation._id,
        projectId: project._id,
        githubRepoId: repoData.githubRepoId,
        fullName: repoData.fullName,
        owner: repoData.owner,
        name: repoData.name,
        private: repoData.isPrivate,
        htmlUrl: repoData.htmlUrl
      },
      { upsert: true, new: true }
    );

    project.githubRepoId = repo._id;
    await project.save();

    return repo;
  }
}
