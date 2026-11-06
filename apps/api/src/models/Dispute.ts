import mongoose, { Document, Schema, Types } from 'mongoose';
import { DisputeStatus, UserRole } from '@openproofpay/shared';

export interface IDisputeMessage {
  senderId: Types.ObjectId;
  senderRole: string;
  message: string;
  attachments?: Array<{ title: string; url?: string; commitSha?: string }>;
  createdAt: Date;
}

export interface IDisputeResolution {
  resolvedBy: Types.ObjectId;
  verdict: DisputeStatus;
  explanation: string;
  refundTransactionId?: string;
  refundAmount?: number;
  resolvedAt: Date;
}

export interface IDisputeDocument extends Document {
  taskId: Types.ObjectId;
  projectId: Types.ObjectId;
  initiatorId: Types.ObjectId;
  initiatorRole: UserRole;
  respondentId: Types.ObjectId;
  reason: string;
  evidenceSummary?: string;
  attachments?: Array<{ title: string; url?: string; commitSha?: string; type?: string }>;
  status: DisputeStatus;
  messages: IDisputeMessage[];
  resolution?: IDisputeResolution;
  createdAt: Date;
  updatedAt: Date;
}

const DisputeSchema = new Schema<IDisputeDocument>(
  {
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true
    },
    initiatorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    initiatorRole: {
      type: String,
      enum: Object.values(UserRole),
      required: true
    },
    respondentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    evidenceSummary: {
      type: String,
      trim: true,
      maxlength: 5000
    },
    attachments: [
      {
        title: { type: String, required: true },
        url: { type: String },
        commitSha: { type: String },
        type: { type: String, default: 'LINK' }
      }
    ],
    status: {
      type: String,
      enum: Object.values(DisputeStatus),
      default: DisputeStatus.OPEN,
      required: true,
      index: true
    },
    messages: [
      {
        senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        senderRole: { type: String, required: true },
        message: { type: String, required: true, trim: true, maxlength: 4000 },
        attachments: [
          {
            title: { type: String, required: true },
            url: { type: String },
            commitSha: { type: String }
          }
        ],
        createdAt: { type: Date, default: Date.now }
      }
    ],
    resolution: {
      resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      verdict: { type: String, enum: Object.values(DisputeStatus) },
      explanation: { type: String, maxlength: 4000 },
      refundTransactionId: { type: String },
      refundAmount: { type: Number },
      resolvedAt: { type: Date }
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

DisputeSchema.index({ taskId: 1, status: 1 });
DisputeSchema.index({ initiatorId: 1, respondentId: 1 });

export const DisputeModel = mongoose.model<IDisputeDocument>('Dispute', DisputeSchema);
