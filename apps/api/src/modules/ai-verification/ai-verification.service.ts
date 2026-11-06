import mongoose, { Types } from 'mongoose';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { TaskModel } from '../../models/Task.js';
import { VerificationReportModel, IVerificationReportDocument } from '../../models/VerificationReport.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { NotificationService } from '../notifications/notifications.service.js';
import { TestExecutionModel } from '../../models/TestExecution.js';
import { TestRunnerService } from '../test-runner/test-runner.service.js';
import { VerificationContextBuilder } from './VerificationContextBuilder.js';
import { PromptSecurity } from './PromptSecurity.js';
import { HallucinationFilter } from './HallucinationFilter.js';
import { ScoringEngine } from './ScoringEngine.js';
import { LLMProviderFactory } from './providers/LLMProviderFactory.js';
import { TaskStateMachineService } from '../../services/TaskStateMachineService.js';
import { AppError } from '../../errors/AppError.js';
import {
  AIVerificationRawOutputSchema,
  AuditAction,
  NotificationType,
  SubmissionStatus,
  TaskStatus,
  UserRole,
  VerificationVerdict
} from '@openproofpay/shared';

export class AIVerificationService {
  private static async recordStage(
    submissionId: Types.ObjectId | string,
    stage: string,
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED',
    details?: string,
    error?: string
  ): Promise<void> {
    try {
      await PullRequestSubmissionModel.findByIdAndUpdate(submissionId, {
        currentStage: stage,
        $push: {
          pipelineStages: {
            stage,
            timestamp: new Date(),
            status,
            details,
            error
          }
        }
      });
    } catch {
      // Non-blocking stage tracking
    }
  }

  /**
   * Run the production AI Verification pipeline on an untrusted pull request submission
   */
  static async verifySubmission(
    submissionId: string,
    actorId?: string,
    actorRole?: string,
    ipAddress?: string
  ): Promise<IVerificationReportDocument> {
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      throw AppError.badRequest('Invalid submission ID format');
    }

    const submission = await PullRequestSubmissionModel.findById(submissionId);
    if (!submission) {
      throw AppError.notFound('Pull request submission record not found');
    }

    const task = await TaskModel.findById(submission.taskId);
    if (!task) {
      throw AppError.notFound('Associated milestone task not found');
    }

    // Transition submission status to EVALUATING
    submission.status = SubmissionStatus.EVALUATING;
    submission.currentStage = 'AI_VERIFICATION_STARTED';
    await submission.save();

    // 1. Transition state machine to VERIFYING if currently in SUBMITTED
    if (task.status === TaskStatus.SUBMITTED) {
      await TaskStateMachineService.transition({
        taskId: task._id.toString(),
        targetStatus: TaskStatus.VERIFYING,
        actorId,
        actorRole: actorRole || UserRole.ADMIN,
        ipAddress,
        reason: 'Autonomous AI Verification & Security analysis started'
      });

      // Dispatch VERIFICATION_STARTED notifications
      if (task.employerId) {
        NotificationService.sendNotification({
          recipientId: task.employerId,
          type: NotificationType.VERIFICATION_STARTED,
          title: 'Verification In Progress',
          message: `Autonomous AI Verification & Sandbox testing started on "${task.title}".`,
          resourceType: 'Task',
          resourceId: task._id
        }).catch(() => {});
      }
      if (task.assignedDeveloperId) {
        NotificationService.sendNotification({
          recipientId: task.assignedDeveloperId,
          type: NotificationType.VERIFICATION_STARTED,
          title: 'Verification In Progress',
          message: `Autonomous AI Verification & Sandbox testing started on "${task.title}".`,
          resourceType: 'Task',
          resourceId: task._id
        }).catch(() => {});
      }
    }

    // 2. Ensure isolated test runner has executed for this submission commit
    const existingTestExecution = await TestExecutionModel.findOne({
      submissionId: submission._id,
      commitSha: submission.headSha
    });
    if (!existingTestExecution) {
      try {
        await TestRunnerService.executeSubmissionTests(submissionId, {
          actorId,
          actorRole,
          ipAddress
        });
      } catch {
        // Proceed with verification even if test runner throws unexpected error
      }
    }

    try {
      // 3. Assemble Smart Context (Issue, Task criteria, PR metadata, unified diff, test execution)
      await this.recordStage(submission._id, 'ISSUE_CONTEXT_FETCHED', 'COMPLETED', `Issue #${task.githubIssueNumber || 'manual'} specifications loaded`);
      const context = await VerificationContextBuilder.buildContext(submission);
      await this.recordStage(submission._id, 'SOURCE_CONTEXT_BUILT', 'COMPLETED', `Built context with ${context.includedFiles.length} files`);

      // Record CI Check Status
      const testStage = context.ciTestStatus === 'PASSED' ? 'TESTS_PASSED' : context.ciTestStatus === 'FAILED' ? 'TESTS_FAILED' : 'TESTS_NOT_RUN';
      await this.recordStage(submission._id, testStage, 'COMPLETED', `GitHub Checks CI Status: ${context.ciTestStatus || 'NOT_CONFIGURED'}`);

      // 4. Prepare Hardened Prompts with Prompt Injection Defenses
      const systemPrompt = PromptSecurity.getHardenedSystemPrompt();
      const userPrompt = VerificationContextBuilder.formatPrompt(context);

      // 5. Invoke Configured Modular LLM Provider
      await this.recordStage(submission._id, 'AI_RUNNING', 'RUNNING', `Gemini evaluating criteria against ${context.changedFiles.length} changed files`);
      const provider = LLMProviderFactory.getProvider();
      let llmResponse: any;
      try {
        llmResponse = await provider.generateCompletion({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          responseFormat: 'json',
          temperature: 0.1
        });
      } catch (err: any) {
        await this.recordStage(submission._id, 'AI_FAILED', 'FAILED', 'Gemini analysis failed', err.message);
        await PullRequestSubmissionModel.findByIdAndUpdate(submission._id, {
          status: SubmissionStatus.FAILED,
          currentStage: 'FAILED'
        });
        throw err;
      }

      if (!llmResponse.parsedJson) {
        await this.recordStage(submission._id, 'AI_FAILED', 'FAILED', 'LLM output was not valid JSON');
        await PullRequestSubmissionModel.findByIdAndUpdate(submission._id, {
          status: SubmissionStatus.FAILED,
          currentStage: 'FAILED'
        });
        throw AppError.internal('LLM response could not be parsed as valid JSON');
      }
      await this.recordStage(submission._id, 'AI_COMPLETED', 'COMPLETED', 'Gemini returned structured evaluation');

      // 5. Strict Schema Validation of AI Output with fallback sanitization
      let parsedOutput: any;
      const zodResult = AIVerificationRawOutputSchema.safeParse(llmResponse.parsedJson);
      if (!zodResult.success) {
        console.warn('[AIVerificationService] AI Raw output schema validation warnings:', JSON.stringify(zodResult.error.issues, null, 2));
        const raw = llmResponse.parsedJson as any;
        const sanitizedRequirements = (raw?.requirementAnalysis || []).map((req: any) => ({
          ...req,
          missingFunctionality: req.missingFunctionality ?? undefined,
          suggestedCorrection: req.suggestedCorrection ?? undefined,
          suggestedFix: req.suggestedFix ?? undefined,
          explanation: req.explanation ?? 'Criterion evaluated',
          status: req.status || (req.satisfied ? 'SATISFIED' : 'UNSATISFIED'),
          evidence: Array.isArray(req.evidence) ? req.evidence : []
        }));
        const fallbackPayload = {
          ...raw,
          overallAssessment: raw?.overallAssessment || 'AI Verification completed analysis of GitHub pull request.',
          recommendation: raw?.recommendation || 'REQUEST_CHANGES',
          resolutionVerdict: raw?.resolutionVerdict || 'PARTIALLY_ADDRESSED',
          requirementAnalysis: sanitizedRequirements,
          testCoverageAssessment: raw?.testCoverageAssessment || 'Analyzed changed files and test suites.',
          confidenceLevel: raw?.confidenceLevel || 'HIGH'
        };
        parsedOutput = AIVerificationRawOutputSchema.parse(fallbackPayload);
      } else {
        parsedOutput = zodResult.data;
      }

      // 6. Anti-Hallucination Filter: eliminate non-existent file paths cited by the LLM
      const { sanitizedOutput } = HallucinationFilter.validateAndSanitize(
        parsedOutput,
        {
          filePaths: context.validFilePaths,
          fileContents: new Map(Object.entries(context.surroundingContext || {})),
          filePatches: new Map(context.changedFiles.map((f) => [f.filename, f.patch || '']))
        }
      );
      await this.recordStage(submission._id, 'EVIDENCE_VALIDATED', 'COMPLETED', 'Evidence checked against commit SHA snapshot');

      // 7. Deterministic Scoring Engine (0–100)
      const mandatoryCriteriaIds = new Set<string>();
      (task.acceptanceCriteria || []).forEach((c) => {
        if (c.mandatory !== false) mandatoryCriteriaIds.add(c.id);
      });

      const scoringResult = ScoringEngine.calculateScore({
        rawOutput: sanitizedOutput,
        testExecution: context.testExecution,
        ciTestStatus: context.ciTestStatus,
        mandatoryCriteriaIds,
        minVerificationScore: task.minVerificationScore ?? 80
      });

      // 8. Invalidate previous reports for this submission/commit (isOutdated: true)
      await VerificationReportModel.updateMany(
        { submissionId: submission._id, isOutdated: false },
        { isOutdated: true }
      );

      // 9. Persist Report in MongoDB
      const report = await VerificationReportModel.create({
        submissionId: submission._id,
        taskId: task._id,
        commitSha: submission.headSha,
        overallScore: scoringResult.overallScore,
        scoreBreakdown: scoringResult.scoreBreakdown,
        verdict: scoringResult.verdict,
        resolutionVerdict: (sanitizedOutput as any).resolutionVerdict || (scoringResult.overallScore >= 80 ? 'FULLY_ADDRESSED' : scoringResult.overallScore >= 50 ? 'PARTIALLY_ADDRESSED' : 'NOT_ADDRESSED'),
        issueAnalysis: (sanitizedOutput as any).issueAnalysis || {
          issueSummary: task.title,
          problemStatement: task.description,
          expectedBehavior: 'Solve requirements stated in GitHub issue.'
        },
        implementationAnalysis: (sanitizedOutput as any).implementationAnalysis || {
          prSummary: submission.title || `PR #${submission.prNumber}`,
          changesSummary: `${submission.files?.length || 0} changed files submitted`
        },
        recommendation: (sanitizedOutput as any).recommendation || (scoringResult.overallScore >= 80 ? 'ACCEPT' : scoringResult.overallScore >= 60 ? 'REQUEST_CHANGES' : 'REJECT'),
        status: scoringResult.status,
        overallAssessment: sanitizedOutput.overallAssessment,
        summary: sanitizedOutput.overallAssessment,
        requirementAnalysis: sanitizedOutput.requirementAnalysis,
        criticalIssues: sanitizedOutput.criticalIssues,
        majorIssues: sanitizedOutput.majorIssues,
        minorSuggestions: sanitizedOutput.minorSuggestions,
        securityFindings: sanitizedOutput.securityFindings,
        codeQualityFindings: sanitizedOutput.codeQualityFindings,
        performanceFindings: sanitizedOutput.performanceFindings,
        positiveFindings: (sanitizedOutput as any).positiveFindings || [],
        missingFunctionality: (sanitizedOutput as any).missingFunctionality || [],
        testCoverageAssessment: sanitizedOutput.testCoverageAssessment,
        confidenceLevel: sanitizedOutput.confidenceLevel,
        modelUsed: `${provider.name}:${llmResponse.model}`,
        isOutdated: false,
        isDecisionSupportOnly: true,
        ciTestStatus: context.ciTestStatus || 'NOT_CONFIGURED',
        ciDetails: context.ciDetails,
        includedFiles: context.includedFiles || [],
        omittedFiles: context.omittedFiles || [],
        tokenBudget: context.tokenBudget || 32000,
        rawOutput: llmResponse.rawText
      });

      await this.recordStage(
        submission._id,
        'REPORT_SAVED',
        'COMPLETED',
        `Report saved (Score: ${scoringResult.overallScore}/100, Verdict: ${scoringResult.verdict})`
      );

      // Update submission status to PASSED or FAILED and mark stage COMPLETED
      const finalSubStatus = scoringResult.verdict === VerificationVerdict.PASS
        ? SubmissionStatus.PASSED
        : SubmissionStatus.FAILED;

      await PullRequestSubmissionModel.findByIdAndUpdate(submission._id, {
        status: finalSubStatus,
        currentStage: 'COMPLETED'
      });

      // 10. Update Task State Machine based on transparent score & verdict
      const currentTask = await TaskModel.findById(task._id);
      if (currentTask && currentTask.status === TaskStatus.VERIFYING) {
        if (scoringResult.verdict === VerificationVerdict.PASS) {
          // Transition: VERIFYING -> VERIFICATION_PASSED -> AWAITING_EMPLOYER_APPROVAL
          await TaskStateMachineService.transition({
            taskId: task._id.toString(),
            targetStatus: TaskStatus.VERIFICATION_PASSED,
            actorId,
            actorRole: actorRole || UserRole.ADMIN,
            ipAddress,
            reason: `AI Verification passed with score ${scoringResult.overallScore}/100`
          });

          await TaskStateMachineService.transition({
            taskId: task._id.toString(),
            targetStatus: TaskStatus.AWAITING_EMPLOYER_APPROVAL,
            actorId,
            actorRole: actorRole || UserRole.ADMIN,
            ipAddress,
            reason: 'Awaiting explicit human Employer review decision'
          });
        } else {
          await TaskStateMachineService.transition({
            taskId: task._id.toString(),
            targetStatus: TaskStatus.VERIFICATION_FAILED,
            actorId,
            actorRole: actorRole || UserRole.ADMIN,
            ipAddress,
            reason: `AI Verification failed with score ${scoringResult.overallScore}/100`
          });
        }
      }

      // 11. Log Immutable Audit Record
      await AuditLogModel.create({
        actorId: actorId ? new Types.ObjectId(actorId) : undefined,
        actorRole: actorRole || 'SYSTEM',
        action: AuditAction.AI_VERIFICATION_COMPLETED,
        resourceType: 'VerificationReport',
        resourceId: report._id.toString(),
        ipAddress,
        metadata: {
          submissionId: submission._id.toString(),
          taskId: task._id.toString(),
          commitSha: submission.headSha,
          score: scoringResult.overallScore,
          verdict: scoringResult.verdict,
          model: `${provider.name}:${llmResponse.model}`
        }
      });

      // 12. Dispatch Notifications
      const verificationType =
        scoringResult.verdict === VerificationVerdict.PASS
          ? NotificationType.VERIFICATION_COMPLETED
          : NotificationType.VERIFICATION_FAILED;

      if (task.employerId) {
        await NotificationService.sendNotification({
          recipientId: task.employerId,
          type: verificationType,
          title: `AI Verification ${scoringResult.verdict} (${scoringResult.overallScore}/100)`,
          message: `Verification complete for milestone "${task.title}". Review deliverable to approve payout.`,
          resourceType: 'VerificationReport',
          resourceId: report._id
        }).catch(() => {});
      }

      if (task.assignedDeveloperId) {
        await NotificationService.sendNotification({
          recipientId: task.assignedDeveloperId,
          type: verificationType,
          title: `AI Verification Complete: ${scoringResult.verdict}`,
          message: `Your PR submission scored ${scoringResult.overallScore}/100 on "${task.title}".`,
          resourceType: 'VerificationReport',
          resourceId: report._id
        }).catch(() => {});
      }

      return report;
    } catch (err: any) {
      console.error(`[AIVerificationService] Verification pipeline failed for submission ${submission._id}:`, err);
      await this.recordStage(submission._id, 'AI_FAILED', 'FAILED', err.message || 'Verification pipeline error');
      await PullRequestSubmissionModel.findByIdAndUpdate(submission._id, {
        status: SubmissionStatus.FAILED,
        currentStage: 'FAILED'
      });
      const currentTask = await TaskModel.findById(task._id);
      if (currentTask && currentTask.status === TaskStatus.VERIFYING) {
        await TaskStateMachineService.transition({
          taskId: currentTask._id.toString(),
          targetStatus: TaskStatus.VERIFICATION_FAILED,
          actorId,
          actorRole: actorRole || UserRole.ADMIN,
          ipAddress,
          reason: `AI Verification failed: ${err.message || 'Pipeline error'}`
        }).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Get the active or latest verification report for a task
   */
  static async getLatestReportForTask(taskId: string): Promise<IVerificationReportDocument | null> {
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      throw AppError.badRequest('Invalid Task ID format');
    }

    return VerificationReportModel.findOne({ taskId, isOutdated: false })
      .sort({ createdAt: -1 });
  }

  /**
   * Get all verification reports (including historical) for a pull request submission
   */
  static async getReportsForSubmission(submissionId: string): Promise<IVerificationReportDocument[]> {
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      throw AppError.badRequest('Invalid submission ID format');
    }

    return VerificationReportModel.find({ submissionId }).sort({ createdAt: -1 });
  }
}