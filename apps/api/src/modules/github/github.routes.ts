import { Router } from 'express';
import { GitHubController } from './github.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

const router = Router();

// OAuth Connect & Callback
router.get('/connect', requireAuth, GitHubController.getConnectUrl);
router.get('/callback', GitHubController.handleCallback);
router.post('/disconnect', requireAuth, GitHubController.disconnect);

// Repositories
router.get('/repos', requireAuth, GitHubController.listRepos);
router.get('/repos/:owner/:repo/branches', requireAuth, GitHubController.listBranches);

// Issues
router.get('/repos/:owner/:repo/issues', requireAuth, GitHubController.listIssues);
router.get('/repos/:owner/:repo/issues/:issueNumber', requireAuth, GitHubController.getIssue);

// Pull Requests
router.get('/repos/:owner/:repo/pulls', requireAuth, GitHubController.listPullRequests);
router.get('/repos/:owner/:repo/pulls/:prNumber', requireAuth, GitHubController.getPullRequest);

// Secure Image Proxy for GitHub-hosted screenshots & user-attachments
router.get('/image-proxy', GitHubController.proxyImage);

export default router;
