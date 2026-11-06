import mongoose, { Document, Schema, Types } from 'mongoose';
import { PaymentStatus } from '@openproofpay/shared';

export interface IPaymentDocument extends Document {
  taskId: Types.ObjectId;
  projectId: Types.ObjectId;
  employerId: Types.ObjectId;
  developerId?: Types.ObjectId;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paypalOrderId?: string;
  paypalAuthorizationId?: string;
  paypalCaptureId?: string;
  paypalPayoutBatchId?: string;
  payoutStatus?: 'NOT_ATTEMPTED' | 'PENDING' | 'SUCCESS' | 'FAILED';
  payoutError?: string;
  payoutItemId?: string;
  payoutRetries?: number;
  idempotencyKey: string;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPaymentDocument>(
  {
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      unique: true,
      index: true
    },
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
    developerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 1.0
    },
    currency: {
      type: String,
      default: 'USD',
      maxlength: 3
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.NOT_CONFIGURED,
      required: true,
      index: true
    },
    paypalOrderId: {
      type: String,
      sparse: true,
      unique: true,
      index: true
    },
    paypalAuthorizationId: {
      type: String,
      sparse: true
    },
    paypalCaptureId: {
      type: String,
      sparse: true
    },
    paypalPayoutBatchId: {
      type: String,
      sparse: true
    },
    payoutStatus: {
      type: String,
      enum: ['NOT_ATTEMPTED', 'PENDING', 'SUCCESS', 'FAILED'],
      default: 'NOT_ATTEMPTED',
      index: true
    },
    payoutError: {
      type: String
    },
    payoutItemId: {
      type: String,
      sparse: true
    },
    payoutRetries: {
      type: Number,
      default: 0
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    approvedAt: {
      type: Date
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
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

PaymentSchema.index({ employerId: 1, status: 1 });
PaymentSchema.index({ developerId: 1, status: 1 });

export const PaymentModel = mongoose.model<IPaymentDocument>('Payment', PaymentSchema);
