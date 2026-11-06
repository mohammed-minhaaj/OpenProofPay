import mongoose, { Types } from 'mongoose';
import { ProjectModel, IProjectDocument } from '../../models/Project.js';
import { GitHubRepositoryModel } from '../../models/GitHubRepository.js';
import { TaskModel } from '../../models/Task.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { AppError } from '../../errors/AppError.js';
import { env } from '../../config/env.js';
import { UserRole, ProjectStatus, AuditAction } from '@openproofpay/shared';

export interface CreateProjectServiceInput {
  name?: string;
  title?: string;
  description?: string;
  githubRepoId?: string;
  githubRepo?: string;
  repoUrl?: string;
  currency?: string;
  totalBudget?: number;
}

export class ProjectsService {
  /**
   * Create a new project workspace
   */
  static async createProject(
    ownerId: string,
    input: CreateProjectServiceInput,
    ipAddress?: string
  ): Promise<IProjectDocument> {
    const projectName = input.name || input.title;
    if (!projectName || projectName.trim().length < 3) {
      throw AppError.badRequest('Project name/title must be at least 3 characters');
    }

    let repoId: Types.ObjectId | undefined;
    if (input.githubRepoId && mongoose.Types.ObjectId.isValid(input.githubRepoId)) {
      const repo = await GitHubRepositoryModel.findById(input.githubRepoId);
      if (repo) {
        repoId = repo._id;
      }
    }

    // Auto-create or bind repository if repository name or URL was provided (e.g. "owner/repo" or "https://github.com/owner/repo")
    const repoIdentifier = input.githubRepo || input.repoUrl || (input.githubRepoId && !mongoose.Types.ObjectId.isValid(input.githubRepoId) ? input.githubRepoId : undefined);
    if (!repoId && repoIdentifier) {
      try {
        let cleanIdentifier = repoIdentifier.trim();
        if (/^https?:\/\//i.test(cleanIdentifier)) {
          const parsed = new URL(cleanIdentifier);
          cleanIdentifier = parsed.pathname.replace(/^\/|\/$/g, '');
        }
        const [owner, name] = cleanIdentifier.split('/');
        if (owner && name) {
          let repo = await GitHubRepositoryModel.findOne({
            owner: new RegExp(`^${owner}$`, 'i'),
            name: new RegExp(`^${name}$`, 'i')
          });
          if (!repo) {
            repo = await GitHubRepositoryModel.create({
              githubRepoId: Math.floor(Math.random() * 899999 + 100000),
              owner,
              name,
              fullName: `${owner}/${name}`,
              defaultBranch: 'main',
              htmlUrl: `https://github.com/${owner}/${name}`,
              isPrivate: false
            });
          }
          repoId = repo._id;
        }
      } catch {
        // Continue if repo string cannot be parsed
      }
    }

    const project = await ProjectModel.create({
      ownerId: new Types.ObjectId(ownerId),
      name: projectName.trim(),
      description: input.description?.trim(),
      githubRepoId: repoId,
      status: ProjectStatus.ACTIVE,
      totalBudget: input.totalBudget ?? 0,
      currency: input.currency || 'USD'
    });

    await AuditLogModel.create({
      actorId: new Types.ObjectId(ownerId),
      actorRole: UserRole.EMPLOYER,
      action: AuditAction.PROJECT_CREATED,
      resourceType: 'Project',
      resourceId: project._id.toString(),
      ipAddress,
      metadata: {
        name: project.name,
        githubRepoId: repoId?.toString()
      }
    });

    return project;
  }

  /**
   * List projects with role-aware visibility
   */
  static async listProjects(
    currentUserId: string,
    currentUserRole: UserRole
  ): Promise<IProjectDocument[]> {
    const query: Record<string, unknown> = {};

    if (currentUserRole === UserRole.EMPLOYER) {
      if (env.NODE_ENV === 'development') {
        query.$or = [{ ownerId: new Types.ObjectId(currentUserId) }, { status: ProjectStatus.ACTIVE }];
      } else {
        query.ownerId = new Types.ObjectId(currentUserId);
      }
    } else {
      query.status = ProjectStatus.ACTIVE;
    }

    return ProjectModel.find(query)
      .populate('githubRepoId', 'fullName owner name isPrivate defaultBranch')
      .populate('ownerId', 'name email githubUsername')
      .sort({ createdAt: -1 });
  }

  /**
   * Get single project with its tasks
   */
  static async getProjectById(
    projectId: string
  ): Promise<{ project: IProjectDocument; tasks: unknown[] }> {
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      throw AppError.badRequest('Invalid Project ID format');
    }

    const project = await ProjectModel.findById(projectId)
      .populate('githubRepoId', 'fullName owner name isPrivate defaultBranch')
      .populate('ownerId', 'name email githubUsername');

    if (!project) {
      throw AppError.notFound('Project not found');
    }

    const tasks = await TaskModel.find({ projectId: project._id })
      .populate('assignedDeveloperId', 'name email githubUsername')
      .sort({ createdAt: -1 });

    return {
      project,
      tasks
    };
  }
}