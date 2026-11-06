import mongoose, { Document, Schema, Types } from 'mongoose';
import { VerificationVerdict } from '@openproofpay/shared';

export interface IScoreBreakdown {
  criteriaScore: number;
  testExecutionScore: number;
  securityScore: number;
  qualityScore: number;
  totalScore: number;
}

export interface IRequirementEvidence {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  quote?: string;
  explanation: string;
  isVerified?: boolean;
  verificationNote?: string;
}

export interface IRequirementAnalysisItem {
  criterionId?: string;
  id?: string;
  title?: string;
  criterionTitle?: string;
  requirement?: string;
  satisfied: boolean;
  status: 'SATISFIED' | 'PARTIALLY_SATISFIED' | 'UNSATISFIED' | 'UNABLE_TO_DETERMINE';
  explanation?: string;
  confidence?: string | number;
  missingFunctionality?: string;
  suggestedCorrection?: string;
  suggestedFix?: string;
  evidence: IRequirementEvidence[];
}

export interface ICodeIssue {
  filePath: string;
  lineNumber?: number;
  message: string;
  codeSnippet?: string;
}

export interface ISecurityFindingItem {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type?: string;
  message: string;
  filePath?: string;
  file?: string;
  lineNumber?: number;
  line?: number;
  recommendation?: string;
}

export interface IVerificationReportDocument extends Document {
  submissionId: Types.ObjectId;
  taskId: Types.ObjectId;
  commitSha: string;
  overallScore: number;
  scoreBreakdown?: IScoreBreakdown;
  verdict: VerificationVerdict | string;
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
  recommendation?: 'ACCEPT' | 'REQUEST_CHANGES' | 'REJECT';
  status: 'PASSED' | 'FAILED' | 'NEEDS_REVIEW';
  overallAssessment: string;
  summary?: string;
  requirementAnalysis: IRequirementAnalysisItem[];
  criticalIssues: ICodeIssue[];
  majorIssues: ICodeIssue[];
  minorSuggestions: ICodeIssue[];
  securityFindings: ISecurityFindingItem[];
  codeQualityFindings: string[];
  performanceFindings: string[];
  positiveFindings?: string[];
  missingFunctionality?: string[];
  testCoverageAssessment: string;
  confidenceLevel: string | number;
  modelUsed: string;
  isOutdated: boolean;
  isDecisionSupportOnly: boolean;
  ciTestStatus?: 'PASSED' | 'FAILED' | 'PENDING' | 'IN_PROGRESS' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'ERROR';
  ciDetails?: any;
  includedFiles?: string[];
  omittedFiles?: string[];
  tokenBudget?: number;
  rawOutput?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EvidenceSchema = new Schema<IRequirementEvidence>(
  {
    filePath: { type: String, required: true },
    lineStart: Number,
    lineEnd: Number,
    quote: String,
    explanation: { type: String, required: true },
    isVerified: { type: Boolean, default: true },
    verificationNote: String
  },
  { _id: false }
);

const RequirementAnalysisSchema = new Schema<IRequirementAnalysisItem>(
  {
    criterionId: String,
    id: String,
    title: String,
    criterionTitle: String,
    requirement: String,
    satisfied: { type: Boolean, required: true },
    status: {
      type: String,
      enum: ['SATISFIED', 'PARTIALLY_SATISFIED', 'UNSATISFIED', 'UNABLE_TO_DETERMINE'],
      default: 'UNSATISFIED'
    },
    explanation: String,
    confidence: Schema.Types.Mixed,
    missingFunctionality: String,
    suggestedCorrection: String,
    suggestedFix: String,
    evidence: { type: [EvidenceSchema], default: [] }
  },
  { _id: false }
);

const CodeIssueSchema = new Schema<ICodeIssue>(
  {
    filePath: { type: String, required: true },
    lineNumber: Number,
    message: { type: String, required: true },
    codeSnippet: String
  },
  { _id: false }
);

const SecurityFindingSchema = new Schema<ISecurityFindingItem>(
  {
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      required: true
    },
    type: { type: String, default: 'VULNERABILITY' },
    message: { type: String, required: true },
    filePath: String,
    file: String,
    lineNumber: Number,
    line: Number,
    recommendation: String
  },
  { _id: false }
);

const VerificationReportSchema = new Schema<IVerificationReportDocument>(
  {
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: 'PullRequestSubmission',
      required: true,
      index: true
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true
    },
    commitSha: {
      type: String,
      required: true,
      trim: true
    },
    overallScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    scoreBreakdown: {
      criteriaScore: { type: Number, default: 0 },
      testExecutionScore: { type: Number, default: 0 },
      securityScore: { type: Number, default: 0 },
      qualityScore: { type: Number, default: 0 },
      totalScore: { type: Number, default: 0 }
    },
    verdict: {
      type: String,
      enum: Object.values(VerificationVerdict),
      default: VerificationVerdict.WARN
    },
    resolutionVerdict: {
      type: String,
      enum: ['FULLY_ADDRESSED', 'PARTIALLY_ADDRESSED', 'NOT_ADDRESSED', 'UNABLE_TO_DETERMINE'],
      default: 'PARTIALLY_ADDRESSED'
    },
    issueAnalysis: {
      issueSummary: String,
      problemStatement: String,
      expectedBehavior: String
    },
    implementationAnalysis: {
      prSummary: String,
      changesSummary: String
    },
    recommendation: {
      type: String,
      enum: ['ACCEPT', 'REQUEST_CHANGES', 'REJECT'],
      default: 'REQUEST_CHANGES'
    },
    status: {
      type: String,
      enum: ['PASSED', 'FAILED', 'NEEDS_REVIEW'],
      default: 'NEEDS_REVIEW',
      required: true,
      index: true
    },
    overallAssessment: {
      type: String,
      default: function (this: any) {
        return this.summary || 'AI Verification Assessment';
      }
    },
    summary: String,
    requirementAnalysis: {
      type: [RequirementAnalysisSchema],
      default: []
    },
    criticalIssues: {
      type: [CodeIssueSchema],
      default: []
    },
    majorIssues: {
      type: [CodeIssueSchema],
      default: []
    },
    minorSuggestions: {
      type: [CodeIssueSchema],
      default: []
    },
    securityFindings: {
      type: [SecurityFindingSchema],
      default: []
    },
    codeQualityFindings: [{ type: String }],
    performanceFindings: [{ type: String }],
    positiveFindings: [{ type: String }],
    missingFunctionality: [{ type: String }],
    testCoverageAssessment: {
      type: String,
      default: 'No automated tests detected'
    },
    confidenceLevel: {
      type: Schema.Types.Mixed,
      default: 'HIGH'
    },
    modelUsed: {
      type: String,
      required: true,
      default: 'gemini-3.5-flash'
    },
    isOutdated: {
      type: Boolean,
      default: false,
      index: true
    },
    isDecisionSupportOnly: {
      type: Boolean,
      default: true
    },
    ciTestStatus: {
      type: String,
      default: 'NOT_CONFIGURED'
    },
    ciDetails: {
      type: Schema.Types.Mixed
    },
    includedFiles: [{ type: String }],
    omittedFiles: [{ type: String }],
    tokenBudget: { type: Number, default: 32000 },
    rawOutput: String
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        const idStr = String(ret._id || ret.id || '');
        ret.id = idStr;
        ret._id = idStr;
        ret.score = ret.overallScore;
        ret.summary = ret.overallAssessment || ret.summary;
        return ret;
      }
    }
  }
);

VerificationReportSchema.index({ submissionId: 1, commitSha: 1 });

export const VerificationReportModel = mongoose.model<IVerificationReportDocument>(
  'VerificationReport',
  VerificationReportSchema
);
