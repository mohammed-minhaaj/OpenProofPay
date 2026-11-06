import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IGitHubRepositoryDocument extends Document {
  installationId?: Types.ObjectId;
  projectId?: Types.ObjectId;
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const GitHubRepositorySchema = new Schema<IGitHubRepositoryDocument>(
  {
    installationId: {
      type: Schema.Types.ObjectId,
      ref: 'GitHubInstallation',
      required: false,
      index: true
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      index: true
    },
    githubRepoId: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },
    owner: {
      type: String,
      required: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    defaultBranch: {
      type: String,
      default: 'main'
    },
    private: {
      type: Boolean,
      default: false
    },
    htmlUrl: {
      type: String,
      required: true,
      trim: true
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

export const GitHubRepositoryModel = mongoose.model<IGitHubRepositoryDocument>(
  'GitHubRepository',
  GitHubRepositorySchema
);
