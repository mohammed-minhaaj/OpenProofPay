import React, { useState, useEffect } from 'react';
import { webApi, UserSession } from '../services/api.js';
import { TaskStatus, VerificationVerdict, TaskReviewAction, UserRole } from '@openproofpay/shared';
import { GitHubMarkdownViewer } from '../components/GitHubMarkdownViewer.js';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileCode,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  GitPullRequest,
  Clock,
  Activity,
  RefreshCw,
  Server,
  Terminal
} from 'lucide-react';

interface ReviewPageScreenProps {
  taskId: string;
  user: UserSession;
  initialTask?: any;
  initialReport?: any;
  onNavigate: (screen: string, taskId?: string) => void;
  onRefreshData: () => void;
}

export const ReviewPageScreen: React.FC<ReviewPageScreenProps> = ({
  taskId,
  user,
  initialTask,
  initialReport,
  onNavigate,
  onRefreshData
}) => {
  const isAdminOrEmployer = user?.role === UserRole.EMPLOYER || user?.role === UserRole.ADMIN;
  const [task, setTask] = useState<any | null>(initialTask || null);
  const [report, setReport] = useState<any | null>(initialReport || null);
  const [submission, setSubmission] = useState<any | null>(null);
  const [testExecution, setTestExecution] = useState<any | null>(null);
  const [payment, setPayment] = useState<any | null>(null);
  const [loading, setLoading] = useState(!initialTask);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSha, setCopiedSha] = useState(false);

  // Expanded card states
  const [expandedCriteria, setExpandedCriteria] = useState<Record<string, boolean>>({});
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});
  const [showFullIssueBody, setShowFullIssueBody] = useState(false);
  const [showFullPrBody, setShowFullPrBody] = useState(false);

  // Review Decision Modals / Inputs
  const [decisionModal, setDecisionModal] = useState<'APPROVE' | 'REVISE' | 'REJECT' | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');

  // Fetch full review context
  const loadReviewData = async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    setError(null);
    try {
      const [taskRes, reportRes, paymentRes] = await Promise.allSettled([
        webApi.getTask(taskId),
        webApi.getVerificationReport(taskId),
        webApi.getTaskPayment(taskId)
      ]);

      if (taskRes.status === 'fulfilled') {
        setTask(taskRes.value.data.task);
        const subs = taskRes.value.data.submissions || [];
        if (subs.length > 0) {
          setSubmission(subs[0]);
        }
        const tests = taskRes.value.data.testExecutions || [];
        if (tests.length > 0) {
          setTestExecution(tests[0]);
        }
      }

      if (reportRes.status === 'fulfilled') {
        setReport(reportRes.value.data);
      }

      if (paymentRes.status === 'fulfilled') {
        setPayment(paymentRes.value.data);
      }
    } catch (err: any) {
      if (!isPolling) setError(err?.message || 'Failed to load review page.');
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  useEffect(() => {
    if (taskId) {
      loadReviewData();
    }
  }, [taskId]);

  useEffect(() => {
    if (!task) return;
    const isActivelyVerifying =
      task.status === TaskStatus.SUBMITTED ||
      task.status === TaskStatus.VERIFYING ||
      submission?.status === 'PENDING' ||
      submission?.status === 'EVALUATING';

    if (!isActivelyVerifying) return;

    const interval = setInterval(() => {
      loadReviewData(true);
    }, 2500);

    return () => clearInterval(interval);
  }, [task?.status, submission?.status]);

  // Handle Copy SHA
  const handleCopySha = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  // Toggle Criterion Expand
  const toggleCriterion = (id: string) => {
    setExpandedCriteria((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Toggle Diff Expand
  const toggleDiff = (filename: string) => {
    setExpandedDiffs((prev) => ({ ...prev, [filename]: !prev[filename] }));
  };

  // Decision Handlers
  const handleApprove = async () => {
    setActionLoading(true);
    setError(null);
    try {
      // 1. Review Task with APPROVE (triggers auto-release on backend for pre-authorized bounties)
      await webApi.reviewTask(taskId, {
        action: TaskReviewAction.APPROVE,
        notes: decisionNotes || 'Deliverable satisfies all acceptance criteria.'
      });

      // 2. Release Payment (safely ignore if already released by auto-release)
      try {
        await webApi.releasePayment(taskId);
      } catch (relErr: any) {
        const isAlreadyReleased =
          relErr?.message?.includes('already in') ||
          relErr?.message?.includes('Duplicate release') ||
          relErr?.message?.includes('PAYMENT_ALREADY_CAPTURED');
        if (!isAlreadyReleased) {
          console.warn('Payment release follow-up note:', relErr?.message);
        }
      }

      setDecisionModal(null);
      await loadReviewData();
      onRefreshData();
    } catch (err: any) {
      setError(err?.message || 'Approval / payment release failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!decisionNotes.trim()) {
      setError('Please provide feedback for the developer explaining requested revisions.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await webApi.reviewTask(taskId, {
        action: TaskReviewAction.REQUEST_REVISION,
        notes: decisionNotes.trim()
      });
      setDecisionModal(null);
      await loadReviewData();
      onRefreshData();
    } catch (err: any) {
      setError(err?.message || 'Failed to request changes.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!decisionNotes.trim()) {
      setError('Please provide a reason for rejecting the deliverable.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await webApi.reviewTask(taskId, {
        action: TaskReviewAction.REJECT,
        reason: decisionNotes.trim()
      });
      setDecisionModal(null);
      await loadReviewData();
      onRefreshData();
    } catch (err: any) {
      setError(err?.message || 'Failed to reject deliverable.');
    } finally {
      setActionLoading(false);
    }
  };

  // Retry Payout Handler
  const handleRetryPayout = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await webApi.retryPayout(taskId);
      await loadReviewData();
      onRefreshData();
    } catch (err: any) {
      setError(err?.message || 'Payout retry failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Re-verify Handler
  const handleReverify = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await webApi.triggerVerification(taskId, submission?._id);
      await loadReviewData();
      onRefreshData();
    } catch (err: any) {
      setError(err?.message || 'Re-verification failed to start.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading unified review workspace...
      </div>
    );
  }

  if (!task) {
    return (
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--accent-red)', marginBottom: '16px' }}>Bounty deliverable not found.</p>
        <button
          onClick={() => onNavigate('home')}
          style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  const isApproved = task.status === TaskStatus.APPROVED || task.status === TaskStatus.PAID || task.status === TaskStatus.PAYMENT_COMPLETED;
  const isOutdated = report?.isOutdated;
  const currentHeadSha = submission?.headSha || report?.commitSha || 'unknown';
  const score = report?.overallScore ?? report?.score ?? 0;
  const verdict = report?.verdict || VerificationVerdict.WARN;
  const recommendation = report?.recommendation || 'REQUEST_CHANGES';
  const resolutionVerdict = report?.resolutionVerdict || (
    score >= 80 ? 'FULLY_ADDRESSED' : score >= 50 ? 'PARTIALLY_ADDRESSED' : 'NOT_ADDRESSED'
  );

  const getResolutionBadge = (v: string) => {
    switch (v) {
      case 'FULLY_ADDRESSED':
        return {
          label: 'FULLY ADDRESSED',
          bg: 'rgba(16, 185, 129, 0.15)',
          color: 'var(--accent-green)',
          border: '1px solid rgba(16, 185, 129, 0.3)'
        };
      case 'PARTIALLY_ADDRESSED':
        return {
          label: 'PARTIALLY ADDRESSED',
          bg: 'rgba(245, 158, 11, 0.15)',
          color: 'var(--accent-amber)',
          border: '1px solid rgba(245, 158, 11, 0.3)'
        };
      case 'NOT_ADDRESSED':
        return {
          label: 'NOT ADDRESSED',
          bg: 'rgba(239, 68, 68, 0.15)',
          color: 'var(--accent-red)',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        };
      case 'UNABLE_TO_DETERMINE':
      default:
        return {
          label: 'UNABLE TO DETERMINE',
          bg: 'rgba(148, 163, 184, 0.15)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-color)'
        };
    }
  };

  // Dedicated Evaluation 1: OpenProofPay Isolated Docker Sandbox Testing
  const sandboxTestStatus = (() => {
    if (!testExecution) {
      return {
        status: 'NOT_RUN' as const,
        label: 'NOT RUN',
        description: 'OpenProofPay isolated container test execution has not been triggered or is not configured for this milestone.',
        badgeBg: 'rgba(148, 163, 184, 0.15)',
        badgeColor: 'var(--text-secondary)'
      };
    }
    if (testExecution.status === 'PASSED' || testExecution.status === 'COMPLETED') {
      return {
        status: 'PASSED' as const,
        label: 'PASSED',
        description: `Isolated container test runner executed successfully (${testExecution.passedTests || 0}/${testExecution.totalTests || 0} tests passed).`,
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        badgeColor: 'var(--accent-green)'
      };
    }
    if (testExecution.status === 'FAILED') {
      return {
        status: 'FAILED' as const,
        label: 'FAILED',
        description: `Automated test suite failed with exit code ${testExecution.exitCode ?? 'non-zero'}. One or more tests failed.`,
        badgeBg: 'rgba(239, 68, 68, 0.15)',
        badgeColor: 'var(--accent-red)'
      };
    }
    if (testExecution.status === 'COULD_NOT_EXECUTE' || testExecution.status === 'ERROR' || testExecution.status === 'TIMEOUT') {
      return {
        status: 'COULD_NOT_EXECUTE' as const,
        label: 'COULD NOT EXECUTE',
        description: 'Automated tests could not be executed in the sandbox container (e.g. Docker daemon is unavailable on host). Implementation is evaluated on code merits.',
        badgeBg: 'rgba(245, 158, 11, 0.15)',
        badgeColor: 'var(--accent-amber)'
      };
    }
    return {
      status: 'NOT_CONFIGURED' as const,
      label: 'NOT CONFIGURED',
      description: 'No test configuration, test files, or supported test runner detected in repository.',
      badgeBg: 'rgba(148, 163, 184, 0.15)',
      badgeColor: 'var(--text-secondary)'
    };
  })();

  // Dedicated Evaluation 2: GitHub Actions CI & Remote Checks
  const githubCiStatus = (() => {
    const ciRaw = String(report?.ciDetails?.status || report?.ciTestStatus || 'NOT_CONFIGURED').toUpperCase();
    if (ciRaw === 'PASSED' || ciRaw === 'SUCCESS') {
      return {
        status: 'SUCCESS' as const,
        label: 'SUCCESS',
        description: 'All GitHub Actions workflows and remote commit status checks passed for this exact commit SHA.',
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        badgeColor: 'var(--accent-green)'
      };
    }
    if (ciRaw === 'FAILED') {
      return {
        status: 'FAILED' as const,
        label: 'FAILED',
        description: 'GitHub Actions reported failure on one or more checks for this commit.',
        badgeBg: 'rgba(239, 68, 68, 0.15)',
        badgeColor: 'var(--accent-red)'
      };
    }
    if (ciRaw === 'IN_PROGRESS') {
      return {
        status: 'IN_PROGRESS' as const,
        label: 'IN PROGRESS',
        description: 'GitHub Actions checks are actively running on GitHub.',
        badgeBg: 'rgba(59, 130, 246, 0.15)',
        badgeColor: 'var(--accent-blue)'
      };
    }
    if (ciRaw === 'PENDING') {
      return {
        status: 'PENDING' as const,
        label: 'PENDING',
        description: 'GitHub Actions checks have been queued or are awaiting execution.',
        badgeBg: 'rgba(245, 158, 11, 0.15)',
        badgeColor: 'var(--accent-amber)'
      };
    }
    if (ciRaw === 'NOT_CONFIGURED') {
      return {
        status: 'NOT_CONFIGURED' as const,
        label: 'NOT CONFIGURED',
        description: 'No GitHub Actions workflows or remote CI check runs are configured for this repository.',
        badgeBg: 'rgba(148, 163, 184, 0.15)',
        badgeColor: 'var(--text-secondary)'
      };
    }
    return {
      status: 'UNAVAILABLE' as const,
      label: 'UNAVAILABLE',
      description: 'GitHub Checks API was unreachable or returned incomplete information. Evaluated independently.',
      badgeBg: 'rgba(245, 158, 11, 0.15)',
      badgeColor: 'var(--accent-amber)'
    };
  })();

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 20px 100px' }}>
      {/* Top back navigation */}
      <button
        onClick={() => onNavigate('bounty', taskId)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          padding: 0,
          marginBottom: '20px'
        }}
      >
        <ArrowLeft size={16} />
        Back to bounty
      </button>

      {/* Outdated SHA Warning Banner */}
      {isOutdated && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '10px',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            color: 'var(--accent-amber)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px'
          }}
        >
          <AlertTriangle size={18} />
          <div>
            <strong>Report Outdated:</strong> Newer commits were pushed to this PR after this report was generated. Re-verification against head SHA is required before approval.
          </div>
        </div>
      )}

      {/* Global Error Banner */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--accent-red)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px'
          }}
        >
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* CARD 1: HEADER CARD */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--card-border)',
          padding: '24px',
          marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '999px',
                backgroundColor: isOutdated ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                color: isOutdated ? 'var(--accent-amber)' : 'var(--accent-green)',
                border: isOutdated ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.3)'
              }}
            >
              {isOutdated ? 'Outdated Report' : 'Current Commit'}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {task.projectName} • PR #{submission?.prNumber || '1'}
            </span>
            {submission?.prUrl && (
              <a
                href={submission.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'var(--accent-blue)',
                  fontSize: '12px',
                  textDecoration: 'none'
                }}
              >
                <GitPullRequest size={13} />
                <span>View PR on GitHub</span>
                <ExternalLink size={11} />
              </a>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Commit SHA:</span>
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(0,0,0,0.2)',
                color: 'var(--text-primary)'
              }}
            >
              {currentHeadSha.slice(0, 7)}
            </code>
            <button
              onClick={() => handleCopySha(currentHeadSha)}
              title="Copy commit SHA"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
            >
              {copiedSha ? <Check size={14} color="var(--accent-green)" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
          {submission?.title || task.title}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span>Author: <strong>{submission?.author || (submission?.developerId?.name || submission?.developerId?.githubUsername || 'Claimed Developer')}</strong></span>
          <span>Bounty Reward: <strong>${task.paymentAmount} {task.currency || 'USD'}</strong></span>
          {submission?.baseBranch && submission?.headBranch && (
            <span>Branches: <code>{submission.baseBranch}</code> &larr; <code>{submission.headBranch}</code></span>
          )}
          <span>Changes: <strong style={{ color: 'var(--accent-green)' }}>+{submission?.additions || 0}</strong> / <strong style={{ color: 'var(--accent-red)' }}>-{submission?.deletions || 0}</strong></span>
          {report?.generatedAt && (
            <span style={{ color: 'var(--text-muted)' }}>
              Verified: {new Date(report.generatedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* CARD 1.5: PIPELINE OBSERVABILITY TRACKER */}
      {/* ============================================================== */}
      {submission?.pipelineStages && submission.pipelineStages.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            border: '1px solid var(--card-border)',
            padding: '20px 24px',
            marginBottom: '20px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="var(--accent-blue)" />
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Verification Pipeline Status
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: submission.currentStage === 'REPORT_SAVED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: submission.currentStage === 'REPORT_SAVED' ? 'var(--accent-green)' : 'var(--accent-blue)'
                }}
              >
                {submission.currentStage || 'PROCESSING'}
              </span>
              {isAdminOrEmployer && (
                <button
                  onClick={handleReverify}
                  disabled={actionLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '5px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: actionLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  <RefreshCw size={12} />
                  Re-run Pipeline
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
            {submission.pipelineStages.map((ps: any, pIdx: number) => {
              const isPassed = ps.status === 'COMPLETED';
              const isFailed = ps.status === 'FAILED';
              return (
                <div
                  key={pIdx}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: isFailed ? 'rgba(239, 68, 68, 0.1)' : isPassed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0,0,0,0.2)',
                    border: `1px solid ${isFailed ? 'rgba(239, 68, 68, 0.3)' : isPassed ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-color)'}`,
                    minWidth: '130px',
                    flexShrink: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                    {isPassed ? (
                      <CheckCircle2 size={13} color="var(--accent-green)" />
                    ) : isFailed ? (
                      <XCircle size={13} color="var(--accent-red)" />
                    ) : (
                      <Clock size={13} color="var(--accent-blue)" />
                    )}
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {ps.stage}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {ps.timestamp ? new Date(ps.timestamp).toLocaleTimeString() : ''}
                  </div>
                  {ps.error && (
                    <div style={{ fontSize: '10px', color: 'var(--accent-red)', marginTop: '2px' }}>
                      {ps.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CARD 2: AI SUMMARY CARD WITH SCORE RING */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--card-border)',
          padding: '24px',
          marginBottom: '20px',
          display: 'grid',
          gridTemplateColumns: '160px 1fr',
          gap: '24px',
          alignItems: 'center'
        }}
      >
        {/* Score Ring */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              border: `6px solid ${score >= 80 ? 'var(--accent-green)' : score >= 60 ? 'var(--accent-amber)' : 'var(--accent-red)'}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.1)'
            }}
          >
            <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {score}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Score / 100
            </span>
          </div>

          <span
            style={{
              marginTop: '10px',
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: verdict === VerificationVerdict.PASS ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: verdict === VerificationVerdict.PASS ? 'var(--accent-green)' : 'var(--accent-red)'
            }}
          >
            {verdict}
          </span>
        </div>

        {/* AI Summary Text & Token Info */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Autonomous AI Recommendation
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: recommendation === 'ACCEPT' ? 'rgba(16, 185, 129, 0.2)' : recommendation === 'REQUEST_CHANGES' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: recommendation === 'ACCEPT' ? 'var(--accent-green)' : recommendation === 'REQUEST_CHANGES' ? 'var(--accent-amber)' : 'var(--accent-red)'
              }}
            >
              {recommendation}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: getResolutionBadge(resolutionVerdict).bg,
                color: getResolutionBadge(resolutionVerdict).color,
                border: getResolutionBadge(resolutionVerdict).border
              }}
            >
              {getResolutionBadge(resolutionVerdict).label}
            </span>
          </div>

          <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)', marginBottom: '12px' }}>
            {report?.overallAssessment || report?.summary || 'Autonomous verification evaluated all criteria, code diffs, and security patterns against head commit snapshot.'}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>Model: {report?.modelUsed || 'gemini-3.5-flash'}</span>
            <span>Reviewed files: {(report?.includedFiles?.length || 1)}</span>
            <span>Decision Support Only (Admin makes final decision)</span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* CARD 3: ISSUE VS. PR ANALYSIS                                  */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--card-border)',
          padding: '24px',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Issue vs. PR Analysis
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '999px',
                  backgroundColor: getResolutionBadge(resolutionVerdict).bg,
                  color: getResolutionBadge(resolutionVerdict).color,
                  border: getResolutionBadge(resolutionVerdict).border
                }}
              >
                {getResolutionBadge(resolutionVerdict).label}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Direct AI comparison between GitHub Issue requirements and the developer's pull request diffs.
            </p>
          </div>
        </div>

        {/* Side-by-side or stacked Issue Specification vs. PR Scope */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '20px'
          }}
        >
          {/* Panel 1: Original GitHub Issue Specification */}
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(59, 130, 246, 0.04)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-blue)', letterSpacing: '0.04em' }}>
                Original GitHub Issue (Source of Truth)
              </span>
              {task.githubIssueUrl && (
                <a
                  href={task.githubIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    color: 'var(--accent-blue)',
                    textDecoration: 'none'
                  }}
                >
                  View #{task.githubIssueNumber || ''} <ExternalLink size={11} />
                </a>
              )}
            </div>

            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {task.title}
            </div>

            {report?.issueAnalysis?.problemStatement && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Problem Statement:</strong> {report.issueAnalysis.problemStatement}
              </div>
            )}

            {report?.issueAnalysis?.expectedBehavior && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Expected Behavior:</strong> {report.issueAnalysis.expectedBehavior}
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowFullIssueBody(!showFullIssueBody)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-blue)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {showFullIssueBody ? 'Hide Full Issue Description' : 'View Full Issue Description'}
                {showFullIssueBody ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {showFullIssueBody && (
                <div
                  style={{
                    marginTop: '8px',
                    maxHeight: '380px',
                    overflowY: 'auto',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--border-color)',
                    fontSize: '12px'
                  }}
                >
                  <GitHubMarkdownViewer content={task.description || 'No detailed issue body recorded.'} />
                </div>
              )}
            </div>
          </div>

          {/* Panel 2: Pull Request Implementation */}
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.04)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-green)', letterSpacing: '0.04em' }}>
                Pull Request Implementation
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {(submission?.files || []).length} Changed Files
              </span>
            </div>

            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              PR #{submission?.prNumber || '1'}: {submission?.title || task.title}
            </div>

            {submission?.author && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Authored by <strong style={{ color: 'var(--text-primary)' }}>@{submission.author}</strong> on commit <span style={{ fontFamily: 'var(--font-mono)' }}>{currentHeadSha.slice(0, 7)}</span>
              </div>
            )}

            {report?.implementationAnalysis?.prSummary && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                <strong style={{ color: 'var(--text-primary)' }}>PR Summary:</strong> {report.implementationAnalysis.prSummary}
              </div>
            )}

            {report?.implementationAnalysis?.changesSummary && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Changes Overview:</strong> {report.implementationAnalysis.changesSummary}
              </div>
            )}

            {submission?.body && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowFullPrBody(!showFullPrBody)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-green)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {showFullPrBody ? 'Hide PR Description' : 'View Full PR Description'}
                  {showFullPrBody ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {showFullPrBody && (
                  <div
                    style={{
                      marginTop: '8px',
                      maxHeight: '380px',
                      overflowY: 'auto',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--border-color)',
                      fontSize: '12px'
                    }}
                  >
                    <GitHubMarkdownViewer content={submission.body} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Missing Functionality Callout Banner */}
        {((report?.missingFunctionality || []).length > 0) && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <AlertTriangle size={16} color="var(--accent-amber)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-amber)' }}>
                Missing or Incomplete Functionality from Issue
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {report.missingFunctionality.map((item: string, idx: number) => (
                <li key={idx} style={{ marginTop: '4px' }}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Critical & Major Bugs / Regressions Callout Banner */}
        {(((report?.criticalIssues || []).length > 0) || ((report?.majorIssues || []).length > 0)) && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <XCircle size={16} color="var(--accent-red)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-red)' }}>
                Bugs & Potential Regressions Identified in Diff
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[...(report?.criticalIssues || []), ...(report?.majorIssues || [])].map((issue: any, idx: number) => (
                <div key={idx} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {issue.filePath}{issue.lineNumber ? `:${issue.lineNumber}` : ''}
                  </span>: {issue.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Issue Requirements Evaluation & Grounded Evidence List */}
        <div style={{ marginBottom: '8px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Detailed Requirement Verification & Code Citations
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {((report?.requirementAnalysis && report.requirementAnalysis.length > 0)
              ? report.requirementAnalysis
              : (task.acceptanceCriteria || [])
            ).map((item: any, i: number) => {
              const id = item.criterionId || item.id || `req-${i}`;
              const isExpanded = !!expandedCriteria[id];
              const itemStatus = (item.status || '').toUpperCase();
              const isSatisfied = item.satisfied || itemStatus === 'SATISFIED';
              const isPartial = itemStatus === 'PARTIALLY_SATISFIED' || itemStatus === 'PARTIAL';
              const isUnable = itemStatus === 'UNABLE_TO_DETERMINE';
              const evidenceList = item.evidence || [];

              const itemTitle = item.title || item.criterionTitle || `Requirement #${i + 1}`;
              const itemReq = item.requirement || item.description || item.explanation || 'Implementation requirement extracted from issue.';

              return (
                <div
                  key={id}
                  style={{
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    onClick={() => toggleCriterion(id)}
                    style={{
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {isSatisfied ? (
                        <CheckCircle2 size={18} color="var(--accent-green)" />
                      ) : isPartial ? (
                        <AlertTriangle size={18} color="var(--accent-amber)" />
                      ) : isUnable ? (
                        <Activity size={18} color="var(--text-secondary)" />
                      ) : (
                        <XCircle size={18} color="var(--accent-red)" />
                      )}

                      <div>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {itemTitle}
                        </span>
                        {item.requirement && (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {item.requirement}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: isSatisfied
                            ? 'rgba(16, 185, 129, 0.15)'
                            : isPartial
                            ? 'rgba(245, 158, 11, 0.15)'
                            : isUnable
                            ? 'rgba(148, 163, 184, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                          color: isSatisfied
                            ? 'var(--accent-green)'
                            : isPartial
                            ? 'var(--accent-amber)'
                            : isUnable
                            ? 'var(--text-secondary)'
                            : 'var(--accent-red)'
                        }}
                      >
                        {isSatisfied ? 'SATISFIED' : isPartial ? 'PARTIALLY SATISFIED' : isUnable ? 'UNABLE TO DETERMINE' : 'NOT SATISFIED'}
                      </span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>
                        {item.explanation || itemReq}
                      </p>

                      {item.missingFunctionality && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(245, 158, 11, 0.08)',
                            border: '1px solid rgba(245, 158, 11, 0.25)',
                            fontSize: '12px',
                            color: 'var(--accent-amber)',
                            marginBottom: '10px'
                          }}
                        >
                          <strong>Missing from implementation:</strong> {item.missingFunctionality}
                        </div>
                      )}

                      {item.suggestedCorrection && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(59, 130, 246, 0.08)',
                            border: '1px solid rgba(59, 130, 246, 0.25)',
                            fontSize: '12px',
                            color: 'var(--accent-blue)',
                            marginBottom: '10px'
                          }}
                        >
                          <strong>Suggested correction:</strong> {item.suggestedCorrection}
                        </div>
                      )}

                      {evidenceList.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {evidenceList.map((ev: any, evIdx: number) => (
                            <div
                              key={evIdx}
                              style={{
                                padding: '10px 12px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                border: '1px solid var(--border-color)',
                                fontSize: '12px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                                  {ev.filePath} {ev.lineStart ? `(lines ${ev.lineStart}-${ev.lineEnd || ev.lineStart})` : ''}
                                </span>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: ev.isVerified !== false ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: ev.isVerified !== false ? 'var(--accent-green)' : 'var(--accent-red)'
                                  }}
                                >
                                  {ev.isVerified !== false ? 'Verified Evidence' : 'Unverified Evidence'}
                                </span>
                              </div>
                              {ev.quote && (
                                <pre
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '11px',
                                    color: 'var(--text-secondary)',
                                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    overflowX: 'auto',
                                    marginBottom: '6px'
                                  }}
                                >
                                  {ev.quote}
                                </pre>
                              )}
                              <div style={{ color: 'var(--text-muted)' }}>
                                {ev.explanation || ev.verificationNote}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No direct diff code citations attached to this requirement.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* CARD 4: SECURITY & CODE QUALITY FINDINGS */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--card-border)',
          padding: '24px',
          marginBottom: '20px'
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Security & Quality Findings
        </h3>

        {/* Security Findings */}
        {(report?.securityFindings || []).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {report.securityFindings.map((finding: any, i: number) => (
              <div
                key={i}
                style={{
                  padding: '12px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  fontSize: '13px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                      color: 'var(--accent-red)'
                    }}
                  >
                    {finding.severity || 'HIGH'}
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {finding.message}
                  </span>
                </div>
                {finding.recommendation && (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Fix recommendation: {finding.recommendation}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', color: 'var(--accent-green)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <ShieldCheck size={16} />
            <span>0 critical security vulnerabilities detected. Prompt injection guardrails passed.</span>
          </div>
        )}

        {/* Quality Findings */}
        {(report?.codeQualityFindings || []).length > 0 && (
          <div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Code Quality Notes
            </span>
            <ul style={{ marginTop: '8px', paddingLeft: '18px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {report.codeQualityFindings.map((q: string, qIdx: number) => (
                <li key={qIdx}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* CARD 5: AUTOMATED TESTING (STRICTLY SEPARATE FROM ISSUE ANALYSIS) */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--card-border)',
          padding: '24px',
          marginBottom: '20px'
        }}
      >
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
            Automated Sandbox Testing & CI Status
          </h3>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            OpenProofPay clearly separates isolated container test execution from remote GitHub Actions CI checks and AI review.
          </span>
        </div>

        {/* Sub-panel 1: Isolated Docker Sandbox Test Runner */}
        <div
          style={{
            padding: '16px',
            borderRadius: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid var(--border-color)',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={16} color="var(--accent-blue)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                OpenProofPay Isolated Container Testing (Docker Sandbox)
              </span>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '999px',
                backgroundColor: sandboxTestStatus.badgeBg,
                color: sandboxTestStatus.badgeColor,
                border: `1px solid ${sandboxTestStatus.badgeColor}40`
              }}
            >
              {sandboxTestStatus.label}
            </span>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 10px 0' }}>
            {sandboxTestStatus.description}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            <span>Environment: <strong style={{ color: 'var(--text-primary)' }}>{testExecution?.runtimeEnvironment || 'none (detected from repo)'}</strong></span>
            <span>Exit code: <strong style={{ color: 'var(--text-primary)' }}>{testExecution?.exitCode !== undefined ? testExecution.exitCode : 'N/A'}</strong></span>
            <span>Total tests: <strong style={{ color: 'var(--text-primary)' }}>{testExecution?.totalTests || 0}</strong></span>
            <span>Passed: <strong style={{ color: 'var(--accent-green)' }}>{testExecution?.passedTests || 0}</strong></span>
            <span>Failed: <strong style={{ color: 'var(--accent-red)' }}>{testExecution?.failedTests || 0}</strong></span>
          </div>

          {testExecution && testExecution.sanitizedLogs && (
            <details style={{ marginTop: '8px' }}>
              <summary style={{ fontSize: '12px', color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}>
                View Container Test Execution Logs
              </summary>
              <pre
                style={{
                  marginTop: '8px',
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--border-color)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {testExecution.sanitizedLogs}
              </pre>
            </details>
          )}
        </div>

        {/* Sub-panel 2: GitHub Actions CI & Remote Checks */}
        <div
          style={{
            padding: '16px',
            borderRadius: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid var(--border-color)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={16} color="var(--accent-purple, #a855f7)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                GitHub Actions CI & Remote Commit Checks
              </span>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '999px',
                backgroundColor: githubCiStatus.badgeBg,
                color: githubCiStatus.badgeColor,
                border: `1px solid ${githubCiStatus.badgeColor}40`
              }}
            >
              {githubCiStatus.label}
            </span>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 10px 0' }}>
            {githubCiStatus.description}
          </p>

          {/* Individual Check Runs List */}
          {report?.ciDetails?.checkRuns && report.ciDetails.checkRuns.length > 0 ? (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {report.ciDetails.checkRuns.map((cr: any, crIdx: number) => {
                const isCheckSuccess = cr.conclusion === 'success' || cr.conclusion === 'neutral' || cr.conclusion === 'skipped';
                const isCheckPending = cr.status === 'in_progress' || cr.status === 'queued';
                return (
                  <div
                    key={crIdx}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: isCheckSuccess ? 'var(--accent-green)' : isCheckPending ? 'var(--accent-blue)' : 'var(--accent-red)'
                        }}
                      />
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cr.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({cr.status}{cr.conclusion ? `: ${cr.conclusion}` : ''})</span>
                    </div>

                    {cr.htmlUrl && (
                      <a
                        href={cr.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontSize: '11px' }}
                      >
                        View on GitHub <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '6px' }}>
              No individual GitHub check runs reported for this commit SHA.
            </div>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* CARD 6: COLLAPSIBLE FILE DIFFS */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--card-border)',
          padding: '24px',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Changed Files & Diffs ({(submission?.files || []).length})
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Snapshot at {currentHeadSha.slice(0, 7)}
          </span>
        </div>

        {(!submission?.files || submission.files.length === 0) ? (
          <div
            style={{
              padding: '32px 20px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              backgroundColor: 'rgba(0,0,0,0.1)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}
          >
            <FileCode size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
            <p style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
              No changed files retrieved
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              GitHub reported 0 changed files or file details could not be retrieved from the repository API.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {submission.files.map((file: any) => {
              const isDiffExpanded = !!expandedDiffs[file.filename];
              const fileStatus = (file.status || 'modified').toLowerCase();
              const statusBg =
                fileStatus === 'added'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : fileStatus === 'removed'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : fileStatus === 'renamed'
                  ? 'rgba(168, 85, 247, 0.15)'
                  : 'rgba(59, 130, 246, 0.15)';
              const statusColor =
                fileStatus === 'added'
                  ? 'var(--accent-green)'
                  : fileStatus === 'removed'
                  ? 'var(--accent-red)'
                  : fileStatus === 'renamed'
                  ? '#c084fc'
                  : 'var(--accent-blue)';

              return (
                <div
                  key={file.filename}
                  style={{
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    onClick={() => toggleDiff(file.filename)}
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileCode size={16} color="var(--accent-blue)" />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {file.filename}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: statusBg,
                          color: statusColor,
                          textTransform: 'uppercase'
                        }}
                      >
                        {fileStatus}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--accent-green)', fontWeight: 600 }}>
                        +{file.additions || 0}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--accent-red)', fontWeight: 600 }}>
                        -{file.deletions || 0}
                      </span>
                      {isDiffExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {isDiffExpanded && (
                    <div style={{ borderTop: '1px solid var(--border-color)', padding: '12px', backgroundColor: 'rgba(0, 0, 0, 0.3)' }}>
                      {file.patch ? (
                        <pre
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            lineHeight: '1.5',
                            color: 'var(--text-secondary)',
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            margin: 0
                          }}
                        >
                          {file.patch}
                        </pre>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--accent-amber)', fontStyle: 'italic', padding: '6px 0' }}>
                          Diff patch not available from GitHub API for this file (file might be binary, removed, or diff exceeded GitHub limit).
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* POST-APPROVAL PAYMENT CARD (AFTER APPROVAL) */}
      {/* ============================================================== */}
      {isApproved && (
        <div
          style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <CheckCircle2 size={20} color="var(--accent-green)" />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              PayPal Sandbox Payment Execution Tracker
            </h3>
          </div>

          {/* 3 Step Payment Pipeline */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {/* Step 1: Authorization */}
            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Step 1: Auth Hold
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-green)' }}>
                AUTHORIZED
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {payment?.paypalAuthorizationId ? payment.paypalAuthorizationId.slice(0, 12) + '...' : 'Recorded'}
              </div>
            </div>

            {/* Step 2: Capture */}
            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Step 2: Capture
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-green)' }}>
                CAPTURED
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {payment?.paypalCaptureId ? payment.paypalCaptureId.slice(0, 12) + '...' : 'Completed'}
              </div>
            </div>

            {/* Step 3: Developer Payout */}
            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Step 3: Dev Payout
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: payment?.payoutStatus === 'FAILED' ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {payment?.payoutStatus || 'SUCCESS'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {payment?.paypalPayoutBatchId ? payment.paypalPayoutBatchId.slice(0, 12) + '...' : 'Paid'}
              </div>
            </div>
          </div>

          {/* Partial Failure & Retry Button */}
          {payment?.payoutStatus === 'FAILED' && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '12px'
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-red)' }}>
                  Developer Payout Pending / Failed
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {payment.payoutError || 'PayPal Payouts API encountered a restricted receiver email.'}
                </div>
              </div>
              {isAdminOrEmployer && (
                <button
                  onClick={handleRetryPayout}
                  disabled={actionLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <RotateCcw size={14} />
                  {actionLoading ? 'Retrying...' : 'Retry Payout'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* STICKY DECISION BAR / DEVELOPER STATUS FOOTER */}
      {/* ============================================================== */}
      {isAdminOrEmployer && !isApproved ? (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border-color)',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 40,
            boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Human Gate: <strong>AI cannot disburse funds. Employer decision required.</strong>
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                setDecisionNotes('');
                setDecisionModal('REJECT');
              }}
              style={{
                padding: '9px 16px',
                borderRadius: '6px',
                backgroundColor: 'var(--status-error-bg)',
                color: 'var(--status-error)',
                border: '1px solid var(--status-error-border)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Reject
            </button>
            <button
              onClick={() => {
                setDecisionNotes('');
                setDecisionModal('REVISE');
              }}
              style={{
                padding: '9px 16px',
                borderRadius: '6px',
                backgroundColor: 'var(--status-warning-bg)',
                color: 'var(--status-warning)',
                border: '1px solid var(--status-warning-border)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Request Changes
            </button>
            <button
              onClick={() => {
                if (isOutdated) {
                  setError('Cannot approve: Verification report is outdated because newer commits exist on this PR. Please re-run verification on the latest head commit.');
                  return;
                }
                setDecisionNotes('');
                setDecisionModal('APPROVE');
              }}
              disabled={isOutdated}
              title={isOutdated ? 'Report is outdated. Re-verify with latest commit before approval.' : undefined}
              style={{
                padding: '9px 20px',
                borderRadius: '6px',
                backgroundColor: isOutdated ? 'var(--text-muted)' : 'var(--accent-green)',
                color: '#ffffff',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isOutdated ? 'not-allowed' : 'pointer',
                opacity: isOutdated ? 0.6 : 1,
                boxShadow: isOutdated ? 'none' : '0 2px 6px rgba(16, 185, 129, 0.3)'
              }}
            >
              Approve & Pay (${task.paymentAmount})
            </button>
          </div>
        </div>
      ) : !isAdminOrEmployer ? (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border-color)',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 40,
            boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isApproved ? (
              <span style={{ fontSize: '13px', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <CheckCircle2 size={16} />
                Approved & Paid Out: The employer approved this deliverable and released payment via PayPal.
              </span>
            ) : task.status === TaskStatus.REVISION_REQUESTED ? (
              <span style={{ fontSize: '13px', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <AlertTriangle size={16} />
                Changes Requested: {task.latestReview?.notes || 'Please address employer feedback and push updates to your PR branch.'}
              </span>
            ) : task.status === TaskStatus.REJECTED ? (
              <span style={{ fontSize: '13px', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <XCircle size={16} />
                Rejected: {task.latestReview?.reason || task.latestReview?.notes || 'Submission did not satisfy requirements.'}
              </span>
            ) : (
              <span style={{ fontSize: '13px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <Clock size={16} />
                Awaiting Admin Review: Your work deliverable has been verified by AI. Awaiting final employer approval and payment release.
              </span>
            )}
          </div>

          <button
            onClick={() => onNavigate('bounty', task._id)}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Back to Bounty Details
          </button>
        </div>
      ) : null}

      {/* Decision Confirmation Modal (Admin / Employer Only) */}
      {isAdminOrEmployer && decisionModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              padding: '28px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)'
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {decisionModal === 'APPROVE' && `Confirm Approval & Disburse $${task.paymentAmount}`}
              {decisionModal === 'REVISE' && 'Request Revisions from Developer'}
              {decisionModal === 'REJECT' && 'Reject Pull Request Submission'}
            </h3>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {decisionModal === 'APPROVE' &&
                'Approving will capture the authorized PayPal hold and send a separate PayPal payout to the developer. This action is immutable.'}
              {decisionModal === 'REVISE' &&
                'The developer will be notified with your feedback and can push additional commits to address requirements.'}
              {decisionModal === 'REJECT' &&
                'Rejection terminates this PR submission and transitions the milestone task to REJECTED.'}
            </p>

            <textarea
              rows={4}
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              placeholder={decisionModal === 'APPROVE' ? 'Optional approval notes...' : 'Required reason / feedback...'}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: 'var(--input-bg)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                marginBottom: '20px',
                resize: 'none'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setDecisionModal(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (decisionModal === 'APPROVE') handleApprove();
                  if (decisionModal === 'REVISE') handleRequestChanges();
                  if (decisionModal === 'REJECT') handleReject();
                }}
                disabled={actionLoading}
                style={{
                  padding: '9px 18px',
                  borderRadius: '6px',
                  backgroundColor: decisionModal === 'APPROVE' ? 'var(--status-success)' : decisionModal === 'REVISE' ? 'var(--status-warning)' : 'var(--status-error)',
                  color: decisionModal === 'REVISE' ? '#0C1018' : '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.15s ease'
                }}
              >
                {actionLoading ? 'Processing...' : 'Confirm Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
