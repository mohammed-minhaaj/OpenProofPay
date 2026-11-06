import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITestExecutionDocument extends Document {
  submissionId: Types.ObjectId;
  taskId: Types.ObjectId;
  commitSha: string;
  runtimeEnvironment: string;
  frameworkDetected?: string;
  commandsExecuted: string[];
  exitCode?: number;
  status: 'PASSED' | 'FAILED' | 'COULD_NOT_EXECUTE' | 'NOT_CONFIGURED';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  durationMs: number;
  sanitizedLogs: string;
  createdAt: Date;
  updatedAt: Date;
}

const TestExecutionSchema = new Schema<ITestExecutionDocument>(
  {
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: 'PullRequestSubmission',
      required: true,
      index: true
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true
    },
    commitSha: {
      type: String,
      required: true,
      trim: true
    },
    runtimeEnvironment: {
      type: String,
      required: true,
      default: 'node:20-alpine'
    },
    frameworkDetected: {
      type: String,
      trim: true
    },
    commandsExecuted: [{ type: String }],
    exitCode: {
      type: Number
    },
    status: {
      type: String,
      enum: ['PASSED', 'FAILED', 'COULD_NOT_EXECUTE', 'NOT_CONFIGURED'],
      default: 'NOT_CONFIGURED',
      required: true,
      index: true
    },
    totalTests: {
      type: Number,
      default: 0
    },
    passedTests: {
      type: Number,
      default: 0
    },
    failedTests: {
      type: Number,
      default: 0
    },
    skippedTests: {
      type: Number,
      default: 0
    },
    durationMs: {
      type: Number,
      default: 0
    },
    sanitizedLogs: {
      type: String,
      default: ''
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

TestExecutionSchema.index({ submissionId: 1, commitSha: 1 });

export const TestExecutionModel = mongoose.model<ITestExecutionDocument>(
  'TestExecution',
  TestExecutionSchema
);
