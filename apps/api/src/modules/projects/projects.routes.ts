import { Router } from 'express';
import { ProjectsController } from './projects.controller.js';
import { GitHubController } from '../github/github.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@openproofpay/shared';

const router = Router();

// Create Project (Employer or Admin)
router.post(
  '/',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  ProjectsController.createProject
);

// List Projects (Authenticated users)
router.get(
  '/',
  requireAuth,
  ProjectsController.listProjects
);

// Get Project details with tasks
router.get(
  '/:id',
  requireAuth,
  ProjectsController.getProjectById
);

// Bind GitHub Repository to Project
router.post(
  '/:projectId/repo',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  GitHubController.bindProjectRepo
);

export default router;