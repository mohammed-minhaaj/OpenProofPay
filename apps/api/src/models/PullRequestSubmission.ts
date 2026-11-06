import mongoose, { Document, Schema, Types } from 'mongoose';
import { SubmissionStatus } from '@openproofpay/shared';

export interface IPipelineStage {
  stage: string;
  timestamp: Date;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  details?: string;
  error?: string;
}

export interface IPullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface IPullRequestSubmissionDocument extends Document {
  taskId: Types.ObjectId;
  developerId: Types.ObjectId;
  repositoryId?: Types.ObjectId;
  prNumber: number;
  prUrl: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body?: string;
  additions: number;
  deletions: number;
  changedFilesCount: number;
  files?: IPullRequestFile[];
  status: SubmissionStatus;
  currentStage?: string;
  pipelineStages?: IPipelineStage[];
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PullRequestSubmissionSchema = new Schema<IPullRequestSubmissionDocument>(
  {
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true
    },
    developerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    repositoryId: {
      type: Schema.Types.ObjectId,
      ref: 'GitHubRepository',
      index: true
    },
    prNumber: {
      type: Number,
      required: true,
      index: true
    },
    prUrl: {
      type: String,
      required: true,
      trim: true
    },
    headSha: {
      type: String,
      required: true,
      trim: true
    },
    baseBranch: {
      type: String,
      default: 'main'
    },
    headBranch: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    body: {
      type: String,
      trim: true
    },
    additions: {
      type: Number,
      default: 0
    },
    deletions: {
      type: Number,
      default: 0
    },
    changedFilesCount: {
      type: Number,
      default: 0
    },
    files: [
      {
        filename: { type: String, required: true },
        status: { type: String, default: 'modified' },
        additions: { type: Number, default: 0 },
        deletions: { type: Number, default: 0 },
        patch: { type: String, default: '' }
      }
    ],
    status: {
      type: String,
      enum: Object.values(SubmissionStatus),
      default: SubmissionStatus.PENDING,
      required: true,
      index: true
    },
    currentStage: {
      type: String,
      default: 'PR_RECEIVED'
    },
    pipelineStages: [
      {
        stage: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        status: { type: String, enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'], default: 'COMPLETED' },
        details: { type: String },
        error: { type: String }
      }
    ],
    submittedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        const idStr = String(ret._id || ret.id || '');
        ret.id = idStr;
        ret._id = idStr;
        return ret;
      }
    }
  }
);

PullRequestSubmissionSchema.index({ taskId: 1, prNumber: 1 });

export const PullRequestSubmissionModel = mongoose.model<IPullRequestSubmissionDocument>(
  'PullRequestSubmission',
  PullRequestSubmissionSchema
);
