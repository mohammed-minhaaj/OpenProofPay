import { Request, Response, NextFunction } from 'express';
import { GitHubModuleService } from './github.service.js';
import { GitHubService } from '../../services/GitHubService.js';
import { AppError } from '../../errors/AppError.js';
import { z } from 'zod';

const BindRepoSchema = z.object({
  githubRepoId: z.number().int().positive(),
  fullName: z.string().min(1),
  owner: z.string().min(1),
  name: z.string().min(1),
  isPrivate: z.boolean(),
  htmlUrl: z.string().url()
});

export class GitHubController {
  static async getConnectUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      const result = GitHubModuleService.getConnectUrl(req.user.userId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async handleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code || !state) {
        throw AppError.badRequest('Missing code or state in OAuth callback');
      }

      const result = await GitHubModuleService.handleCallback(code, state, req.ip);

      // Return JSON or redirect to Web Dashboard if browser navigated
      if (req.accepts('html')) {
        res.redirect(`${process.env.CLIENT_ORIGIN || 'http://localhost:3000'}/settings?github=connected&username=${result.username}`);
      } else {
        res.status(200).json({ success: true, data: result });
      }
    } catch (err) {
      next(err);
    }
  }

  static async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      await GitHubModuleService.disconnect(req.user.userId, req.ip);
      res.status(200).json({ success: true, message: 'GitHub account disconnected successfully' });
    } catch (err) {
      next(err);
    }
  }

  static async listRepos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      const repos = await GitHubService.listUserRepositories(req.user.userId);
      res.status(200).json({ success: true, data: repos });
    } catch (err) {
      next(err);
    }
  }

  static async bindProjectRepo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      const projectId = req.params.projectId;
      if (!projectId) throw AppError.badRequest('Project ID is required');

      const validated = BindRepoSchema.parse(req.body);
      const repo = await GitHubModuleService.bindRepositoryToProject(projectId, validated, req.user.userId);
      res.status(200).json({ success: true, data: repo });
    } catch (err) {
      next(err);
    }
  }

  static async listBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      const { owner, repo } = req.params;
      if (!owner || !repo) throw AppError.badRequest('Owner and repo are required');

      const branches = await GitHubService.listBranches(owner, repo, req.user.userId);
      res.status(200).json({ success: true, data: branches });
    } catch (err) {
      next(err);
    }
  }

  static async listIssues(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      const { owner, repo } = req.params;
      if (!owner || !repo) throw AppError.badRequest('Owner and repo are required');

      const issues = await GitHubService.listIssues(owner, repo, req.user.userId);
      res.status(200).json({ success: true, data: issues });
    } catch (err) {
      next(err);
    }
  }

  static async getIssue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      const { owner, repo, issueNumber } = req.params;
      if (!owner || !repo || !issueNumber) throw AppError.badRequest('Owner, repo, and issueNumber are required');

      const issue = await GitHubService.getIssue(owner, repo, parseInt(issueNumber, 10), req.user.userId);
      res.status(200).json({ success: true, data: issue });
    } catch (err) {
      next(err);
    }
  }

  static async listPullRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) throw AppError.badRequest('Owner and repo are required');

      const octokit = await GitHubService.getOctokitClient(req.user?.userId);
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 30
      });

      const pulls = (data || []).map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        htmlUrl: pr.html_url,
        headSha: pr.head.sha,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        author: pr.user?.login || 'unknown',
        createdAt: pr.created_at
      }));

      res.status(200).json({ success: true, data: pulls });
    } catch (err) {
      next(err);
    }
  }

  static async getPullRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw AppError.unauthorized();
      const { owner, repo, prNumber } = req.params;
      if (!owner || !repo || !prNumber) throw AppError.badRequest('Owner, repo, and prNumber are required');

      const pr = await GitHubService.getPullRequest(owner, repo, parseInt(prNumber, 10), req.user.userId);
      res.status(200).json({ success: true, data: pr });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Secure Image Proxy for GitHub-hosted screenshots and attachments
   * Strictly whitelists GitHub domains to prevent SSRF
   * Forwards GitHub authorization header if required for private repo attachments
   */
  static async proxyImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl) {
        throw AppError.badRequest('Image URL query parameter is required');
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(imageUrl);
      } catch {
        throw AppError.badRequest('Invalid image URL format');
      }

      if (parsedUrl.protocol !== 'https:') {
        throw AppError.badRequest('Only HTTPS image URLs are supported');
      }

      const allowedHosts = [
        'github.com',
        'raw.githubusercontent.com',
        'user-images.githubusercontent.com',
        'avatars.githubusercontent.com',
        'camo.githubusercontent.com',
        'objects.githubusercontent.com',
        'media.githubusercontent.com',
        'private-user-images.githubusercontent.com'
      ];

      const isAllowed = allowedHosts.some(
        (h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith(`.${h}`)
      );

      if (!isAllowed) {
        throw AppError.badRequest('Domain not permitted for image proxy');
      }

      const headers: Record<string, string> = {
        'User-Agent': 'OpenProofPay-ImageProxy/1.0',
        Accept: 'image/*,*/*'
      };

      const userId = (req as any).user?.userId;
      if (userId) {
        try {
          const { GitHubInstallationModel } = await import('../../models/GitHubInstallation.js');
          const { decryptSecret } = await import('../../utils/crypto.js');
          const installation = await GitHubInstallationModel.findOne({ userId }).select('+encryptedAccessToken');
          if (installation?.encryptedAccessToken) {
            const token = decryptSecret(installation.encryptedAccessToken);
            headers['Authorization'] = `token ${token}`;
          }
        } catch {
          // Fall through without token
        }
      }

      const imageRes = await fetch(imageUrl, {
        headers,
        redirect: 'follow'
      });

      if (!imageRes.ok) {
        res.status(imageRes.status).send(`Failed to fetch image: ${imageRes.statusText}`);
        return;
      }

      const contentType = imageRes.headers.get('content-type') || 'image/png';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const buffer = Buffer.from(await imageRes.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
}
