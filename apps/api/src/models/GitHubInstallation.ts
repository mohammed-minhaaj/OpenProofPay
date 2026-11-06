import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IGitHubInstallationDocument extends Document {
  userId: Types.ObjectId;
  installationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
  encryptedAccessToken?: string;
  tokenExpiresAt?: Date;
  permissions: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const GitHubInstallationSchema = new Schema<IGitHubInstallationDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    installationId: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },
    accountLogin: {
      type: String,
      required: true,
      trim: true
    },
    accountType: {
      type: String,
      enum: ['User', 'Organization'],
      default: 'User'
    },
    encryptedAccessToken: {
      type: String,
      select: false
    },
    tokenExpiresAt: {
      type: Date
    },
    permissions: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.encryptedAccessToken;
        delete ret.__v;
        const idStr = String(ret._id || ret.id || '');
        ret.id = idStr;
        ret._id = idStr;
        return ret;
      }
    }
  }
);

export const GitHubInstallationModel = mongoose.model<IGitHubInstallationDocument>(
  'GitHubInstallation',
  GitHubInstallationSchema
);
