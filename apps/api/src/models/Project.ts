import mongoose, { Document, Schema, Types } from 'mongoose';
import { ProjectStatus } from '@openproofpay/shared';

export interface IProjectDocument extends Document {
  ownerId: Types.ObjectId;
  name: string;
  description?: string;
  githubRepoId?: Types.ObjectId;
  status: ProjectStatus;
  totalBudget: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProjectDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000
    },
    githubRepoId: {
      type: Schema.Types.ObjectId,
      ref: 'GitHubRepository',
      index: true
    },
    status: {
      type: String,
      enum: Object.values(ProjectStatus),
      default: ProjectStatus.ACTIVE,
      required: true,
      index: true
    },
    totalBudget: {
      type: Number,
      default: 0,
      min: 0
    },
    currency: {
      type: String,
      default: 'USD',
      maxlength: 3
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

ProjectSchema.index({ ownerId: 1, status: 1 });

export const ProjectModel = mongoose.model<IProjectDocument>('Project', ProjectSchema);
