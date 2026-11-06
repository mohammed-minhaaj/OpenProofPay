import mongoose, { Document, Schema, Types } from 'mongoose';
import { AuditAction } from '@openproofpay/shared';

export interface IAuditLogDocument extends Document {
  actorId?: Types.ObjectId;
  actorRole?: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLogDocument>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    actorRole: {
      type: String
    },
    action: {
      type: String,
      enum: Object.values(AuditAction),
      required: true,
      index: true
    },
    resourceType: {
      type: String,
      required: true,
      index: true
    },
    resourceId: {
      type: String,
      required: true,
      index: true
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    },
    metadata: {
      type: Schema.Types.Mixed
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

// ============================================================================
// APPEND-ONLY IMMUTABILITY PRE-HOOKS (BLOCK UPDATES AND DELETIONS)
// ============================================================================
const blockAuditLogMutation = function (this: any, next: (err?: Error) => void) {
  next(new Error('IMMUTABLE_LOG: AuditLog is append-only. Modifying or deleting audit records is strictly prohibited by security policy.'));
};

AuditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('IMMUTABLE_LOG: Existing audit log records cannot be modified.'));
  }
  next();
});

AuditLogSchema.pre('updateOne', blockAuditLogMutation);
AuditLogSchema.pre('updateMany', blockAuditLogMutation);
AuditLogSchema.pre('findOneAndUpdate', blockAuditLogMutation);
AuditLogSchema.pre('replaceOne', blockAuditLogMutation);
AuditLogSchema.pre('deleteOne', blockAuditLogMutation);
AuditLogSchema.pre('deleteMany', blockAuditLogMutation);
AuditLogSchema.pre('findOneAndDelete', blockAuditLogMutation);

AuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });

export const AuditLogModel = mongoose.model<IAuditLogDocument>('AuditLog', AuditLogSchema);
