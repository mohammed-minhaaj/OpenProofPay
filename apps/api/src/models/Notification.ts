import mongoose, { Document, Schema, Types } from 'mongoose';
import { NotificationType } from '@openproofpay/shared';

export interface INotificationDocument extends Document {
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  resourceType: 'Task' | 'Payment' | 'VerificationReport' | 'Dispute';
  resourceId: Types.ObjectId;
  read: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotificationDocument>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    resourceType: {
      type: String,
      enum: ['Task', 'Payment', 'VerificationReport', 'Dispute'],
      required: true
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
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

NotificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });

export const NotificationModel = mongoose.model<INotificationDocument>(
  'Notification',
  NotificationSchema
);
