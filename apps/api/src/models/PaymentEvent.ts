import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPaymentEventDocument extends Document {
  paymentId: Types.ObjectId;
  eventType: string;
  previousStatus: string;
  newStatus: string;
  paypalWebhookId?: string;
  rawPayloadSummary?: Record<string, unknown>;
  createdAt: Date;
}

const PaymentEventSchema = new Schema<IPaymentEventDocument>(
  {
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true
    },
    eventType: {
      type: String,
      required: true,
      index: true
    },
    previousStatus: {
      type: String,
      required: true
    },
    newStatus: {
      type: String,
      required: true
    },
    paypalWebhookId: {
      type: String,
      sparse: true,
      index: true
    },
    rawPayloadSummary: {
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

PaymentEventSchema.index({ paymentId: 1, createdAt: -1 });

// ============================================================================
// APPEND-ONLY IMMUTABILITY PRE-HOOKS (BLOCK UPDATES AND DELETIONS)
// ============================================================================
const blockPaymentEventMutation = function (this: any, next: (err?: Error) => void) {
  next(new Error('IMMUTABLE_LOG: PaymentEvent is append-only. Modifying or deleting payment event records is strictly prohibited by security policy.'));
};

PaymentEventSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('IMMUTABLE_LOG: Existing payment event records cannot be modified.'));
  }
  next();
});

PaymentEventSchema.pre('updateOne', blockPaymentEventMutation);
PaymentEventSchema.pre('updateMany', blockPaymentEventMutation);
PaymentEventSchema.pre('findOneAndUpdate', blockPaymentEventMutation);
PaymentEventSchema.pre('replaceOne', blockPaymentEventMutation);
PaymentEventSchema.pre('deleteOne', blockPaymentEventMutation);
PaymentEventSchema.pre('deleteMany', blockPaymentEventMutation);
PaymentEventSchema.pre('findOneAndDelete', blockPaymentEventMutation);

export const PaymentEventModel = mongoose.model<IPaymentEventDocument>(
  'PaymentEvent',
  PaymentEventSchema
);
