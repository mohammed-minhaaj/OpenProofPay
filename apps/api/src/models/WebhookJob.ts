import mongoose, { Document, Schema } from 'mongoose';
import { WebhookJobStatus } from '@openproofpay/shared';

export interface IWebhookJobDocument extends Document {
  deliveryId: string;
  event: string;
  jobType?: string;
  action?: string;
  repositoryFullName?: string;
  payload: Record<string, any>;
  status: WebhookJobStatus | string;
  retries: number;
  maxRetries: number;
  backoffMs: number;
  lastError?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookJobSchema = new Schema<IWebhookJobDocument>(
  {
    deliveryId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    event: {
      type: String,
      required: true,
      index: true
    },
    action: {
      type: String
    },
    repositoryFullName: {
      type: String,
      index: true
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true
    },
    status: {
      type: String,
      enum: Object.values(WebhookJobStatus),
      default: WebhookJobStatus.QUEUED,
      index: true
    },
    retries: {
      type: Number,
      default: 0
    },
    maxRetries: {
      type: Number,
      default: 3
    },
    backoffMs: {
      type: Number,
      default: 1000
    },
    jobType: {
      type: String,
      default: 'github_webhook'
    },
    lastError: {
      type: String
    },
    processedAt: {
      type: Date
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

WebhookJobSchema.index({ status: 1, createdAt: 1 });

export const WebhookJobModel = mongoose.model<IWebhookJobDocument>('WebhookJob', WebhookJobSchema);
