import mongoose, { Document, Schema } from 'mongoose';
import { UserRole } from '@openproofpay/shared';

export interface IUserDocument extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  githubConnected: boolean;
  githubUsername?: string;
  paypalEmail?: string;
  paypalMerchantId?: string;
  refreshTokenHash?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true,
      minlength: 60
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.DEVELOPER,
      required: true,
      index: true
    },
    githubConnected: {
      type: Boolean,
      default: false
    },
    githubUsername: {
      type: String,
      sparse: true,
      trim: true,
      index: true
    },
    paypalEmail: {
      type: String,
      lowercase: true,
      trim: true
    },
    paypalMerchantId: {
      type: String,
      trim: true
    },
    refreshTokenHash: {
      type: String,
      select: false
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.refreshTokenHash;
        delete ret.__v;
        const idStr = String(ret._id || ret.id || '');
        ret.id = idStr;
        ret._id = idStr;
        return ret;
      }
    }
  }
);

export const UserModel = mongoose.model<IUserDocument>('User', UserSchema);
