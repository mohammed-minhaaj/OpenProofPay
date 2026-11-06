import mongoose from 'mongoose';
import { TaskModel } from '../../models/Task.js';
import { PaymentModel } from '../../models/Payment.js';
import { VerificationReportModel } from '../../models/VerificationReport.js';
import { TestExecutionModel } from '../../models/TestExecution.js';
import { ProjectModel } from '../../models/Project.js';
import { TaskStatus, PaymentStatus, UserRole } from '@openproofpay/shared';
import { env } from '../../config/env.js';

export interface TasksOverTimeItem {
  date: string;
  created: number;
  verified: number;
  completed: number;
}

export interface VerificationDistributionItem {
  verdict: string;
  count: number;
  percentage: number;
}

export interface PaymentsByProjectItem {
  project: string;
  disbursed: number;
  authorized: number;
}

export interface QualityTrendsItem {
  date: string;
  avgAiScore: number;
  avgDurationSec: number;
  testPassRate: number;
}

export interface AnalyticsOverview {
  summary: {
    totalProjects: number;
    totalTasks: number;
    totalBountiesValue: number;
    totalDisbursed: number;
    activeHoldAmount: number;
    overallPassRate: number;
  };
  tasksOverTime: TasksOverTimeItem[];
  verificationDistribution: VerificationDistributionItem[];
  paymentsByProject: PaymentsByProjectItem[];
  qualityTrends: QualityTrendsItem[];
}

export class AnalyticsService {
  static async getOverview(userId: string, role: string): Promise<AnalyticsOverview> {
    const isEmployer = role === UserRole.EMPLOYER;
    const isDeveloper = role === UserRole.DEVELOPER;
    const isAdmin = role === UserRole.ADMIN;
    const isDev = env.NODE_ENV === 'development';

    const userObjectId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : undefined;

    // 1. Task filter based on role (in development, show all tasks for local analytics)
    const taskQuery: any = {};
    if (!isDev && userObjectId) {
      if (isEmployer && !isAdmin) {
        taskQuery.employerId = userObjectId;
      } else if (isDeveloper && !isAdmin) {
        taskQuery.assignedDeveloperId = userObjectId;
      }
    }

    const tasks = await TaskModel.find(taskQuery).lean();
    const taskIds = tasks.map((t) => t._id);

    // 2. Fetch Projects (in development, show all projects for full overview)
    const projectQuery = !isDev && isEmployer && !isAdmin && userObjectId ? { ownerId: userObjectId } : {};
    const projects = await ProjectModel.find(projectQuery).lean();
    const projectMap = new Map(projects.map((p) => [p._id.toString(), p.name]));

    // 3. Fetch Payments
    const paymentQuery = taskIds.length > 0 ? { taskId: { $in: taskIds } } : {};
    const payments = await PaymentModel.find(paymentQuery).lean();

    // Summary calculations
    const totalBountiesValue = tasks.reduce((sum, t) => sum + (t.paymentAmount || 0), 0);
    const totalDisbursed = payments
      .filter((p) => p.status === PaymentStatus.CAPTURED || p.status === PaymentStatus.PAID_OUT)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const activeHoldAmount = payments
      .filter((p) => p.status === PaymentStatus.AUTHORIZED)
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // 4. Tasks Over Time (Group by month / date)
    const timeBuckets: { [key: string]: { created: number; verified: number; completed: number } } = {};
    
    // Seed at least past 6 periods if empty so charts display clean axes
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      timeBuckets[key] = { created: 0, verified: 0, completed: 0 };
    }

    tasks.forEach((t) => {
      const date = new Date(t.createdAt);
      const key = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (!timeBuckets[key]) {
        timeBuckets[key] = { created: 0, verified: 0, completed: 0 };
      }
      timeBuckets[key]!.created += 1;
      if (t.status === TaskStatus.APPROVED || t.status === TaskStatus.PAYMENT_COMPLETED) {
        timeBuckets[key]!.verified += 1;
      }
      if (t.status === TaskStatus.PAYMENT_COMPLETED) {
        timeBuckets[key]!.completed += 1;
      }
    });

    const tasksOverTime: TasksOverTimeItem[] = Object.keys(timeBuckets).map((key) => ({
      date: key,
      created: timeBuckets[key]?.created ?? 0,
      verified: timeBuckets[key]?.verified ?? 0,
      completed: timeBuckets[key]?.completed ?? 0
    }));

    // 5. Verification Reports Distribution
    const reportQuery = taskIds.length > 0 ? { taskId: { $in: taskIds } } : {};
    const reports = await VerificationReportModel.find(reportQuery).lean();

    const verdictCounts: { [verdict: string]: number } = {
      PASS: 0,
      FAIL: 0,
      REVISION_REQUESTED: 0,
      SECURITY_WARNING: 0
    };

    reports.forEach((r) => {
      const v = r.verdict || 'REVISION_REQUESTED';
      if (verdictCounts[v] !== undefined) {
        verdictCounts[v] += 1;
      } else {
        verdictCounts[v] = 1;
      }
    });

    const totalReports = reports.length || 1;
    const verificationDistribution: VerificationDistributionItem[] = Object.keys(verdictCounts).map((v) => {
      const count = verdictCounts[v] ?? 0;
      return {
        verdict: v,
        count,
        percentage: Math.round((count / totalReports) * 100)
      };
    });

    const passCount = verdictCounts['PASS'] ?? 0;
    const overallPassRate = Math.round((passCount / totalReports) * 100);

    // 6. Payments Disbursed by Project
    const projectPaymentMap: { [projectId: string]: { disbursed: number; authorized: number } } = {};
    payments.forEach((p) => {
      const pId = p.projectId ? p.projectId.toString() : 'general';
      if (!projectPaymentMap[pId]) {
        projectPaymentMap[pId] = { disbursed: 0, authorized: 0 };
      }
      if (p.status === PaymentStatus.CAPTURED || p.status === PaymentStatus.PAID_OUT) {
        projectPaymentMap[pId]!.disbursed += p.amount || 0;
      } else if (p.status === PaymentStatus.AUTHORIZED) {
        projectPaymentMap[pId]!.authorized += p.amount || 0;
      }
    });

    const paymentsByProject: PaymentsByProjectItem[] = Object.keys(projectPaymentMap).map((pId) => ({
      project: projectMap.get(pId) || `Project ${pId.slice(-4)}`,
      disbursed: projectPaymentMap[pId]?.disbursed ?? 0,
      authorized: projectPaymentMap[pId]?.authorized ?? 0
    }));

    // If empty projects, add friendly row so charts render gracefully
    if (paymentsByProject.length === 0 && projects.length > 0) {
      projects.slice(0, 3).forEach((proj) => {
        paymentsByProject.push({
          project: proj.name,
          disbursed: 0,
          authorized: 0
        });
      });
    }

    // 7. Quality Trends: Average AI Score & Test Execution Duration
    const testExecutions = await TestExecutionModel.find(
      taskIds.length > 0 ? { taskId: { $in: taskIds } } : {}
    ).lean();

    const qualityBuckets: {
      [key: string]: { aiScores: number[]; durations: number[]; passedTests: number; totalTests: number };
    } = {};

    // Initialize with the same time periods
    Object.keys(timeBuckets).forEach((key) => {
      qualityBuckets[key] = { aiScores: [], durations: [], passedTests: 0, totalTests: 0 };
    });

    reports.forEach((r) => {
      const key = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (qualityBuckets[key]) {
        qualityBuckets[key]!.aiScores.push(r.overallScore ?? 85);
      }
    });

    testExecutions.forEach((te) => {
      const key = new Date(te.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (qualityBuckets[key]) {
        qualityBuckets[key]!.durations.push((te.durationMs || 1000) / 1000);
        qualityBuckets[key]!.passedTests += te.passedTests || 0;
        qualityBuckets[key]!.totalTests += te.totalTests || 0;
      }
    });

    const qualityTrends: QualityTrendsItem[] = Object.keys(qualityBuckets).map((key) => {
      const b = qualityBuckets[key];
      const aiScores = b?.aiScores ?? [];
      const durations = b?.durations ?? [];
      const passedTests = b?.passedTests ?? 0;
      const totalTests = b?.totalTests ?? 0;

      const avgAiScore = aiScores.length
        ? Math.round(aiScores.reduce((a, c) => a + c, 0) / aiScores.length)
        : 0;
      const avgDurationSec = durations.length
        ? Number((durations.reduce((a, c) => a + c, 0) / durations.length).toFixed(1))
        : 0;
      const testPassRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 100;

      return {
        date: key,
        avgAiScore,
        avgDurationSec,
        testPassRate
      };
    });

    return {
      summary: {
        totalProjects: projects.length,
        totalTasks: tasks.length,
        totalBountiesValue,
        totalDisbursed,
        activeHoldAmount,
        overallPassRate
      },
      tasksOverTime,
      verificationDistribution,
      paymentsByProject,
      qualityTrends
    };
  }
}
