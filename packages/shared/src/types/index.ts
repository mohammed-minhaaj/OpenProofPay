import { z } from 'zod';
import {
  UserRole,
  TaskStatus,
  PaymentStatus,
  ProjectStatus,
  SubmissionStatus,
  VerificationVerdict,
  TestExecutionStatus,
  DisputeStatus,
  NotificationType,
  AuditAction,
  CriterionCategory,
  TaskReviewAction
} from '../enums/index.js';
import {
  RegisterUserSchema,
  LoginUserSchema,
  UpdateProfileSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  TaskApprovalSchema,
  TaskRevisionSchema,
  TaskRejectionSchema,
  ReviewTaskSchema,
  AcceptanceCriterionSchema,
  CreateSubmissionSchema,
  RequirementCheckItemSchema,
  SecurityFindingSchema,
  VerificationReportSchema,
  AIVerificationRawOutputSchema,
  CriterionRequirementAnalysisSchema,
  CodeIssueItemSchema,
  DetailedSecurityFindingSchema,
  ScoreBreakdownSchema,
  TriggerVerificationSchema,
  TestExecutionResultSchema,
  CreatePaymentOrderSchema,
  CapturePaymentSchema,
  PayPalWebhookPayloadSchema,
  CreateDisputeSchema,
  ResolveDisputeSchema
} from '../schemas/index.js';

// ============================================================================
// SCHEMA INFERRED TYPES
// ============================================================================
export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;
export type LoginUserInput = z.infer<typeof LoginUserSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export type CreateProjectInput = z.input<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.input<typeof UpdateProjectSchema>;

export type CreateTaskInput = z.input<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.input<typeof UpdateTaskSchema>;
export type TaskApprovalInput = z.infer<typeof TaskApprovalSchema>;
export type TaskRevisionInput = z.infer<typeof TaskRevisionSchema>;
export type TaskRejectionInput = z.infer<typeof TaskRejectionSchema>;
export type ReviewTaskInput = z.infer<typeof ReviewTaskSchema>;
export type AcceptanceCriterionInput = z.infer<typeof AcceptanceCriterionSchema>;

export interface IAcceptanceCriterion {
  id: string;
  title?: string;
  description: string;
  mandatory: boolean;
  category?: CriterionCategory | string;
}

export type CreateSubmissionInput = z.infer<typeof CreateSubmissionSchema>;

export type RequirementCheckItem = z.infer<typeof RequirementCheckItemSchema>;
export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;
export type VerificationReportData = z.infer<typeof VerificationReportSchema>;
export type AIVerificationRawOutput = z.infer<typeof AIVerificationRawOutputSchema>;
export type CriterionRequirementAnalysis = z.infer<typeof CriterionRequirementAnalysisSchema>;
export type CodeIssueItem = z.infer<typeof CodeIssueItemSchema>;
export type DetailedSecurityFinding = z.infer<typeof DetailedSecurityFindingSchema>;
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;
export type TriggerVerificationInput = z.infer<typeof TriggerVerificationSchema>;

export type TestExecutionResultData = z.infer<typeof TestExecutionResultSchema>;

export type CreatePaymentOrderInput = z.infer<typeof CreatePaymentOrderSchema>;
export type CapturePaymentInput = z.infer<typeof CapturePaymentSchema>;
export type PayPalWebhookPayload = z.infer<typeof PayPalWebhookPayloadSchema>;

export type CreateDisputeInput = z.infer<typeof CreateDisputeSchema>;
export type ResolveDisputeInput = z.infer<typeof ResolveDisputeSchema>;

// ============================================================================
// DOMAIN MODEL CONTRACTS
// ============================================================================
export interface IUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  githubUsername?: string;
  githubId?: string;
  paypalReceiverEmail?: string;
  paypalMerchantId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IProject {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  employerId?: string;
  ownerId?: string;
  githubRepoId?: string;
  currency: string;
  totalBudget: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ITask {
  id: string;
  projectId: string;
  employerId?: string;
  title: string;
  description: string;
  issueNumber?: number;
  issueUrl?: string;
  assignedDeveloperId?: string;
  status: TaskStatus;
  paymentAmount: number;
  bountyAmount?: number;
  currency: string;
  minVerificationScore: number;
  acceptanceCriteria?: IAcceptanceCriterion[];
  acceptedPrId?: string;
  acceptedSubmissionId?: string;
  deadline?: string;
  latestReview?: {
    action: TaskReviewAction;
    reviewerId: string;
    notes?: string;
    feedback?: string;
    reason?: string;
    failedCriteriaIds?: string[];
    failedTestIds?: string[];
    reviewedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface IGitHubInstallation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: 'Organization' | 'User';
  targetId: number;
  permissions: Record<string, string>;
  installedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IGitHubRepository {
  id: string;
  installationId: string;
  githubRepoId: number;
  fullName: string;
  owner: string;
  name: string;
  isPrivate: boolean;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface IPullRequestSubmission {
  id: string;
  taskId: string;
  developerId: string;
  prNumber: number;
  prUrl: string;
  branchName: string;
  headCommitSha: string;
  baseCommitSha?: string;
  diffSummary: {
    additions: number;
    deletions: number;
    changedFiles: number;
  };
  status: SubmissionStatus;
  submittedAt: string;
  updatedAt: string;
}

export interface IVerificationReport {
  id: string;
  submissionId: string;
  taskId: string;
  commitSha?: string;
  score: number;
  overallScore?: number;
  scoreBreakdown?: ScoreBreakdown;
  verdict: VerificationVerdict;
  resolutionVerdict?: 'FULLY_ADDRESSED' | 'PARTIALLY_ADDRESSED' | 'NOT_ADDRESSED' | 'UNABLE_TO_DETERMINE';
  issueAnalysis?: {
    issueSummary?: string;
    problemStatement?: string;
    expectedBehavior?: string;
  };
  implementationAnalysis?: {
    prSummary?: string;
    changesSummary?: string;
  };
  status?: 'PASSED' | 'FAILED' | 'NEEDS_REVIEW';
  summary?: string;
  overallAssessment?: string;
  requirementsReview?: RequirementCheckItem[];
  requirementAnalysis?: CriterionRequirementAnalysis[];
  securityAnalysis?: SecurityFinding[];
  securityFindings?: DetailedSecurityFinding[];
  criticalIssues?: CodeIssueItem[];
  majorIssues?: CodeIssueItem[];
  minorSuggestions?: CodeIssueItem[];
  codeQualityScore?: number;
  codeQualityFindings?: string[];
  performanceFindings?: string[];
  testCoverageAssessment?: string;
  confidenceLevel?: string | number;
  aiModel?: string;
  modelUsed?: string;
  isOutdated: boolean;
  isDecisionSupportOnly: boolean;
  rawOutput?: string;
  generatedAt: string;
}

export interface ITestExecution {
  id: string;
  submissionId: string;
  taskId: string;
  containerId?: string;
  status: TestExecutionStatus;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
  durationMs: number;
  cpuLimit: string;
  memLimit: string;
  ranAt: string;
}

export interface IPayment {
  id: string;
  taskId: string;
  projectId: string;
  employerId: string;
  developerId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalPayoutBatchId?: string;
  idempotencyKey: string;
  authorizedAt?: string;
  capturedAt?: string;
  paidOutAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IPaymentEvent {
  id: string;
  paymentId: string;
  eventType: string;
  previousStatus: string;
  newStatus: string;
  actorId?: string;
  externalReference?: string;
  rawPayload?: Record<string, unknown>;
  timestamp: string;
}

export interface INotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface IAuditLog {
  id: string;
  actorId?: string;
  actorRole?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface IDispute {
  id: string;
  taskId: string;
  paymentId: string;
  raisedById: string;
  respondentId: string;
  reason: string;
  evidenceUrls: string[];
  status: DisputeStatus;
  resolutionNote?: string;
  resolvedById?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// API TRANSPORT & STANDARD RESPONSES
// ============================================================================
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}
