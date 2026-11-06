import mongoose, { Document, Schema, Types } from 'mongoose';
import { TaskStatus, TaskReviewAction, CriterionCategory } from '@openproofpay/shared';

export interface IAcceptanceCriterion {
  id: string;
  title?: string;
  description: string;
  mandatory: boolean;
  category?: CriterionCategory | string;
}

export interface ITaskReviewRecord {
  action: TaskReviewAction | string;
  reviewerId: Types.ObjectId;
  notes?: string;
  feedback?: string;
  reason?: string;
  failedCriteriaIds?: string[];
  failedTestIds?: string[];
  reviewedAt: Date;
}

export interface ITaskDocument extends Document {
  projectId: Types.ObjectId;
  employerId: Types.ObjectId;
  assignedDeveloperId?: Types.ObjectId;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  title: string;
  description: string;
  acceptanceCriteria: IAcceptanceCriterion[];
  paymentAmount: number;
  currency: string;
  deadline?: Date;
  status: TaskStatus;
  minVerificationScore: number;
  acceptedSubmissionId?: Types.ObjectId;
  latestReview?: ITaskReviewRecord;
  createdAt: Date;
  updatedAt: Date;
}

const AcceptanceCriterionSchema = new Schema<IAcceptanceCriterion>(
  {
    id: { type: String, required: true },
    title: { type: String, trim: true, default: '' },
    description: { type: String, required: true, trim: true },
    mandatory: { type: Boolean, default: true },
    category: { type: String, default: CriterionCategory.FUNCTIONAL }
  },
  { _id: false }
);

const TaskReviewSchema = new Schema<ITaskReviewRecord>(
  {
    action: { type: String, enum: Object.values(TaskReviewAction), required: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, trim: true },
    feedback: { type: String, trim: true },
    reason: { type: String, trim: true },
    failedCriteriaIds: [{ type: String }],
    failedTestIds: [{ type: String }],
    reviewedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const TaskSchema = new Schema<ITaskDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true
    },
    employerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    assignedDeveloperId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    githubIssueNumber: {
      type: Number,
      index: true
    },
    githubIssueUrl: {
      type: String,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    acceptanceCriteria: {
      type: [AcceptanceCriterionSchema],
      default: []
    },
    paymentAmount: {
      type: Number,
      required: true,
      min: 1.0
    },
    currency: {
      type: String,
      default: 'USD',
      maxlength: 3
    },
    deadline: {
      type: Date
    },
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.CREATED,
      required: true,
      index: true
    },
    minVerificationScore: {
      type: Number,
      default: 80,
      min: 0,
      max: 100
    },
    acceptedSubmissionId: {
      type: Schema.Types.ObjectId,
      ref: 'PullRequestSubmission'
    },
    latestReview: {
      type: TaskReviewSchema
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
        ret.bountyAmount = ret.paymentAmount;
        return ret;
      }
    }
  }
);

TaskSchema.index({ projectId: 1, status: 1 });
TaskSchema.index({ employerId: 1, status: 1 });
TaskSchema.index({ assignedDeveloperId: 1, status: 1 });

export const TaskModel = mongoose.model<ITaskDocument>('Task', TaskSchema);
