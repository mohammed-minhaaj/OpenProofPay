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
  TaskReviewAction,
  AIRecommendation,
  WebhookJobStatus
} from '../enums/index.js';

// ============================================================================
// ENUM SCHEMAS
// ============================================================================
export const UserRoleSchema = z.nativeEnum(UserRole);
export const TaskStatusSchema = z.nativeEnum(TaskStatus);
export const PaymentStatusSchema = z.nativeEnum(PaymentStatus);
export const ProjectStatusSchema = z.nativeEnum(ProjectStatus);
export const SubmissionStatusSchema = z.nativeEnum(SubmissionStatus);
export const VerificationVerdictSchema = z.nativeEnum(VerificationVerdict);
export const TestExecutionStatusSchema = z.nativeEnum(TestExecutionStatus);
export const DisputeStatusSchema = z.nativeEnum(DisputeStatus);
export const NotificationTypeSchema = z.nativeEnum(NotificationType);
export const AuditActionSchema = z.nativeEnum(AuditAction);
export const CriterionCategorySchema = z.nativeEnum(CriterionCategory);
export const TaskReviewActionSchema = z.nativeEnum(TaskReviewAction);
export const AIRecommendationSchema = z.nativeEnum(AIRecommendation);
export const WebhookJobStatusSchema = z.nativeEnum(WebhookJobStatus);

// ============================================================================
// AUTH & USER SCHEMAS
// ============================================================================
export const RegisterUserSchema = z.object({
  email: z.string().email('Valid email is required').trim().toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  role: UserRoleSchema,
  githubUsername: z.string().trim().optional(),
  paypalReceiverEmail: z.string().email().trim().toLowerCase().optional()
});

export const LoginUserSchema = z.object({
  email: z.string().email('Valid email is required').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required')
});

export const UpdateProfileSchema = z.object({
  name: z.string().min(2).trim().optional(),
  githubUsername: z.string().trim().optional(),
  paypalReceiverEmail: z.string().email().trim().toLowerCase().optional(),
  paypalMerchantId: z.string().trim().optional()
});

// ============================================================================
// PROJECT SCHEMAS
// ============================================================================
export const CreateProjectSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(140).trim(),
  description: z.string().max(2000).trim().optional(),
  githubRepoId: z.string().optional(),
  githubRepo: z.string().optional(),
  currency: z.string().length(3).default('USD'),
  totalBudget: z.number().min(0).default(0)
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

// ============================================================================
// TASK / MILESTONE SCHEMAS
// ============================================================================
export const AcceptanceCriterionSchema = z.object({
  id: z.string().min(1, 'Criterion ID is required'),
  title: z.string().max(140).trim().optional(),
  description: z.string().min(3, 'Description must be at least 3 characters').trim(),
  mandatory: z.boolean().default(true),
  category: z.string().default('FUNCTIONAL')
});

export const CreateTaskSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200).trim(),
  description: z.string().min(5, 'Detailed description is required').trim(),
  issueNumber: z.number().int().positive().optional(),
  issueUrl: z.string().url().optional(),
  assignedDeveloperId: z.string().optional(),
  paymentAmount: z.number().positive('Payment amount must be greater than zero').optional(),
  bountyAmount: z.number().positive('Bounty amount must be greater than zero').optional(),
  currency: z.string().length(3).default('USD'),
  minVerificationScore: z.number().min(0).max(100).default(80),
  deadline: z.string().optional(),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema).optional().default([])
});

export const UpdateTaskSchema = CreateTaskSchema.partial();

export const TaskApprovalSchema = z.object({
  submissionId: z.string().min(1, 'Submission ID is required'),
  notes: z.string().max(1000).trim().optional()
});

export const TaskRevisionSchema = z.object({
  submissionId: z.string().min(1, 'Submission ID is required'),
  feedback: z.string().min(5, 'Feedback must be at least 5 characters').max(2000).trim()
});

export const TaskRejectionSchema = z.object({
  submissionId: z.string().min(1, 'Submission ID is required'),
  reason: z.string().min(5, 'Rejection reason is required').max(2000).trim()
});

export const ReviewTaskSchema = z.object({
  action: TaskReviewActionSchema,
  notes: z.string().max(2000).optional(),
  feedback: z.string().max(3000).optional(),
  reason: z.string().max(3000).optional(),
  failedCriteriaIds: z.array(z.string()).optional(),
  failedTestIds: z.array(z.string()).optional()
});

// ============================================================================
// SUBMISSION & GITHUB SCHEMAS
// ============================================================================
export const CreateSubmissionSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'),
  prNumber: z.number().int().positive('Valid PR number is required'),
  prUrl: z.string().url('Valid GitHub PR URL is required'),
  branchName: z.string().min(1, 'Branch name is required'),
  headCommitSha: z.string().min(7, 'Commit SHA is required'),
  baseCommitSha: z.string().min(7, 'Base commit SHA is required').optional()
});

// ============================================================================
// AI VERIFICATION SCHEMAS
// ============================================================================
export const EvidenceItemSchema = z.object({
  filePath: z.string().nullish().transform((v) => v ?? ''),
  lineStart: z.number().int().nullish().transform((v) => v ?? undefined),
  lineEnd: z.number().int().nullish().transform((v) => v ?? undefined),
  quote: z.string().nullish().transform((v) => v ?? undefined),
  explanation: z.string().nullish().transform((v) => v ?? ''),
  isVerified: z.boolean().nullish().transform((v) => v ?? undefined),
  verificationNote: z.string().nullish().transform((v) => v ?? undefined)
});

export const CriterionRequirementAnalysisSchema = z.object({
  criterionId: z.string().nullish().transform((v) => v ?? undefined),
  id: z.string().nullish().transform((v) => v ?? undefined),
  title: z.string().nullish().transform((v) => v ?? undefined),
  criterionTitle: z.string().nullish().transform((v) => v ?? undefined),
  requirement: z.string().nullish().transform((v) => v ?? undefined),
  satisfied: z.boolean().nullish().transform((v) => v ?? undefined),
  status: z.union([
    z.enum(['SATISFIED', 'PARTIALLY_SATISFIED', 'UNSATISFIED', 'UNABLE_TO_DETERMINE']),
    z.enum(['satisfied', 'partial', 'not_satisfied', 'cannot_determine'])
  ]),
  explanation: z.string().nullish().transform((v) => v ?? undefined),
  confidence: z.union([z.number(), z.string()]).nullish().transform((v) => v ?? undefined),
  missingFunctionality: z.string().nullish().transform((v) => v ?? undefined),
  suggestedCorrection: z.string().nullish().transform((v) => v ?? undefined),
  suggestedFix: z.string().nullish().transform((v) => v ?? undefined),
  evidence: z.array(EvidenceItemSchema).nullish().transform((v) => v ?? [])
});

export const CodeIssueItemSchema = z.object({
  filePath: z.string().nullish().transform((v) => v ?? ''),
  lineNumber: z.number().int().nullish().transform((v) => v ?? undefined),
  message: z.string().nullish().transform((v) => v ?? ''),
  codeSnippet: z.string().nullish().transform((v) => v ?? undefined)
});

export const DetailedSecurityFindingSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).nullish().transform((v) => v ?? 'LOW'),
  type: z.string().nullish().transform((v) => v ?? 'VULNERABILITY'),
  message: z.string().nullish().transform((v) => v ?? ''),
  filePath: z.string().nullish().transform((v) => v ?? undefined),
  file: z.string().nullish().transform((v) => v ?? undefined),
  lineNumber: z.number().int().nullish().transform((v) => v ?? undefined),
  line: z.number().int().nullish().transform((v) => v ?? undefined),
  recommendation: z.string().nullish().transform((v) => v ?? undefined)
});

export const ScoreBreakdownSchema = z.object({
  criteriaScore: z.number().min(0).max(50),
  testExecutionScore: z.number().min(0).max(25).optional().default(0),
  securityScore: z.number().min(0).max(25),
  qualityScore: z.number().min(0).max(25),
  totalScore: z.number().min(0).max(100),
  ruleApplied: z.string().optional()
});

export const AIVerificationRawOutputSchema = z.object({
  overallAssessment: z.string().min(1).default('Verification completed.'),
  recommendation: z.enum(['ACCEPT', 'REQUEST_CHANGES', 'REJECT']).nullish().transform((v) => v ?? 'REQUEST_CHANGES'),
  resolutionVerdict: z.enum(['FULLY_ADDRESSED', 'PARTIALLY_ADDRESSED', 'NOT_ADDRESSED', 'UNABLE_TO_DETERMINE']).nullish().transform((v) => v ?? 'PARTIALLY_ADDRESSED'),
  issueAnalysis: z.object({
    issueSummary: z.string().nullish().transform((v) => v ?? undefined),
    problemStatement: z.string().nullish().transform((v) => v ?? undefined),
    expectedBehavior: z.string().nullish().transform((v) => v ?? undefined)
  }).nullish().transform((v) => v ?? undefined),
  implementationAnalysis: z.object({
    prSummary: z.string().nullish().transform((v) => v ?? undefined),
    changesSummary: z.string().nullish().transform((v) => v ?? undefined)
  }).nullish().transform((v) => v ?? undefined),
  requirementAnalysis: z.array(CriterionRequirementAnalysisSchema).nullish().transform((v) => v ?? []),
  criticalIssues: z.array(CodeIssueItemSchema).nullish().transform((v) => v ?? []),
  majorIssues: z.array(CodeIssueItemSchema).nullish().transform((v) => v ?? []),
  minorSuggestions: z.array(CodeIssueItemSchema).nullish().transform((v) => v ?? []),
  securityFindings: z.array(DetailedSecurityFindingSchema).nullish().transform((v) => v ?? []),
  codeQualityFindings: z.array(z.string()).nullish().transform((v) => v ?? []),
  performanceFindings: z.array(z.string()).nullish().transform((v) => v ?? []),
  positiveFindings: z.array(z.string()).nullish().transform((v) => v ?? []),
  missingFunctionality: z.array(z.string()).nullish().transform((v) => v ?? []),
  testCoverageAssessment: z.string().nullish().transform((v) => v ?? 'Tests analyzed'),
  confidenceLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullish().transform((v) => v ?? 'HIGH')
});

export const RequirementCheckItemSchema = z.object({
  requirement: z.string(),
  met: z.boolean(),
  notes: z.string()
});

export const SecurityFindingSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  message: z.string(),
  line: z.number().int().optional(),
  file: z.string().optional()
});

export const VerificationReportSchema = z.object({
  submissionId: z.string().min(1),
  taskId: z.string().min(1),
  commitSha: z.string().optional(),
  score: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100).optional(),
  scoreBreakdown: ScoreBreakdownSchema.optional(),
  verdict: VerificationVerdictSchema,
  resolutionVerdict: z.enum(['FULLY_ADDRESSED', 'PARTIALLY_ADDRESSED', 'NOT_ADDRESSED', 'UNABLE_TO_DETERMINE']).optional(),
  issueAnalysis: z.object({
    issueSummary: z.string().optional(),
    problemStatement: z.string().optional(),
    expectedBehavior: z.string().optional()
  }).optional(),
  implementationAnalysis: z.object({
    prSummary: z.string().optional(),
    changesSummary: z.string().optional()
  }).optional(),
  recommendation: z.enum(['ACCEPT', 'REQUEST_CHANGES', 'REJECT']).optional(),
  status: z.enum(['PASSED', 'FAILED', 'NEEDS_REVIEW']).optional(),
  summary: z.string().optional(),
  overallAssessment: z.string().optional(),
  requirementAnalysis: z.array(CriterionRequirementAnalysisSchema).optional(),
  requirementsReview: z.array(RequirementCheckItemSchema).optional(),
  securityAnalysis: z.array(SecurityFindingSchema).optional(),
  securityFindings: z.array(DetailedSecurityFindingSchema).optional(),
  criticalIssues: z.array(CodeIssueItemSchema).optional(),
  majorIssues: z.array(CodeIssueItemSchema).optional(),
  minorSuggestions: z.array(CodeIssueItemSchema).optional(),
  codeQualityScore: z.number().min(0).max(100).optional(),
  codeQualityFindings: z.array(z.string()).optional(),
  performanceFindings: z.array(z.string()).optional(),
  positiveFindings: z.array(z.string()).optional(),
  missingFunctionality: z.array(z.string()).optional(),
  testCoverageAssessment: z.string().optional(),
  confidenceLevel: z.union([z.string(), z.number()]).optional(),
  aiModel: z.string().optional(),
  modelUsed: z.string().optional(),
  isOutdated: z.boolean().default(false),
  isDecisionSupportOnly: z.boolean().default(true),
  ciTestStatus: z.string().optional(),
  ciDetails: z.any().optional(),
  rawOutput: z.string().optional(),
  generatedAt: z.string().optional()
});

export const TriggerVerificationSchema = z.object({
  submissionId: z.string().min(1, 'Submission ID is required')
});

// ============================================================================
// TEST EXECUTION SCHEMAS
// ============================================================================
export const TestExecutionResultSchema = z.object({
  submissionId: z.string().min(1),
  taskId: z.string().min(1),
  containerId: z.string().optional(),
  status: TestExecutionStatusSchema,
  exitCode: z.number().int().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  testsTotal: z.number().int().nonnegative().default(0),
  testsPassed: z.number().int().nonnegative().default(0),
  testsFailed: z.number().int().nonnegative().default(0),
  durationMs: z.number().nonnegative().default(0),
  cpuLimit: z.string().default('1.0'),
  memLimit: z.string().default('512m'),
  ranAt: z.string().datetime()
});

// ============================================================================
// PAYMENT SCHEMAS
// ============================================================================
export const CreatePaymentOrderSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional()
});

export const CapturePaymentSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'),
  submissionId: z.string().min(1, 'Submission ID is required')
});

export const PayPalWebhookPayloadSchema = z.object({
  id: z.string(),
  event_version: z.string().optional(),
  create_time: z.string().optional(),
  resource_type: z.string(),
  event_type: z.string(),
  summary: z.string().optional(),
  resource: z.record(z.unknown())
});

// ============================================================================
// DISPUTE SCHEMAS
// ============================================================================
export const CreateDisputeSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'),
  reason: z.string().min(10, 'Reason must provide sufficient detail').max(3000),
  evidenceUrls: z.array(z.string().url()).default([])
});

export const ResolveDisputeSchema = z.object({
  status: z.enum([DisputeStatus.RESOLVED_EMPLOYER, DisputeStatus.RESOLVED_DEVELOPER, DisputeStatus.CANCELLED]),
  resolutionNote: z.string().min(5, 'Resolution rationale is required').max(2000)
});
