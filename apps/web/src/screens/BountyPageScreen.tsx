import React, { useState, useEffect } from 'react';
import { webApi, UserSession } from '../services/api.js';
import { TaskStatus } from '@openproofpay/shared';
import { GitHubMarkdownViewer } from '../components/GitHubMarkdownViewer.js';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  GitPullRequest,
  Check,
  AlertCircle,
  DollarSign,
  Clock,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

interface BountyPageScreenProps {
  taskId: string;
  user: UserSession;
  initialTask?: any;
  onNavigate: (screen: string, taskId?: string) => void;
  onRefreshData: () => void;
}

export const BountyPageScreen: React.FC<BountyPageScreenProps> = ({
  taskId,
  user,
  initialTask,
  onNavigate,
  onRefreshData
}) => {
  const isAdmin = user.role === 'EMPLOYER' || user.role === 'ADMIN';
  const [task, setTask] = useState<any | null>(initialTask || null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(!initialTask);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // PR Submission state
  const [prUrl, setPrUrl] = useState('');
  const [showPrInput, setShowPrInput] = useState(false);
  const [availablePrs, setAvailablePrs] = useState<any[]>([]);
  const [loadingPrs, setLoadingPrs] = useState(false);

  // Fetch task details
  const fetchTask = async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    try {
      const res = await webApi.getTask(taskId);
      setTask(res.data.task);
      setSubmissions(res.data.submissions || []);
    } catch (err: any) {
      if (!isPolling) setError(err?.message || 'Failed to load bounty.');
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  useEffect(() => {
    if (taskId) {
      fetchTask();
    }
  }, [taskId]);

  // Polling for live status updates while task is being submitted or verified
  useEffect(() => {
    if (!task) return;

    const isActivelyVerifying =
      task.status === TaskStatus.SUBMITTED ||
      task.status === TaskStatus.VERIFYING ||
      submissions.some(
        (s: any) =>
          s.status === 'PENDING' ||
          s.status === 'EVALUATING' ||
          (s.currentStage &&
            s.currentStage !== 'COMPLETED' &&
            s.currentStage !== 'REPORT_SAVED' &&
            s.currentStage !== 'FAILED' &&
            s.status !== 'PASSED' &&
            s.status !== 'FAILED')
      );

    if (!isActivelyVerifying) return;

    const interval = setInterval(() => {
      fetchTask(true);
    }, 2500);

    return () => clearInterval(interval);
  }, [task?.status, submissions]);

  // Derive repo owner and repo name from task data
  const repoOwner =
    task?.projectId?.githubRepoId?.owner ||
    task?.githubIssueUrl?.match(/github\.com\/([^/]+)\/([^/]+)/)?.[1] ||
    (typeof task?.projectId?.name === 'string' && task.projectId.name.includes('/')
      ? task.projectId.name.split('/')[0].trim()
      : null);

  const repoName =
    task?.projectId?.githubRepoId?.name ||
    task?.githubIssueUrl?.match(/github\.com\/([^/]+)\/([^/]+)/)?.[2] ||
    (typeof task?.projectId?.name === 'string' && task.projectId.name.includes('/')
      ? task.projectId.name.split('/')[1].trim()
      : null);

  // Auto-detect open PRs from GitHub when repo information is available
  useEffect(() => {
    if (repoOwner && repoName) {
      setLoadingPrs(true);
      webApi
        .listPullRequests(repoOwner, repoName)
        .then((res) => {
          if (res?.data) {
            setAvailablePrs(res.data);
          }
        })
        .catch(() => {
          setAvailablePrs([]);
        })
        .finally(() => {
          setLoadingPrs(false);
        });
    }
  }, [repoOwner, repoName]);

  // Handle Claim
  const handleClaim = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await webApi.claimTask(taskId);
      setSuccessMsg('You have successfully claimed this bounty! You can now submit your pull request.');
      await fetchTask();
      onRefreshData();
    } catch (err: any) {
      setError(err?.message || 'Failed to claim bounty.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Submit PR URL
  const handleSubmitPr = async () => {
    if (!prUrl.trim()) {
      setError('Please provide or select a valid GitHub Pull Request URL.');
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await webApi.submitPR(taskId, { prUrl: prUrl.trim() });
      setSuccessMsg('Pull request submitted! AI Verification pipeline is running.');
      setShowPrInput(false);
      await fetchTask();
      onRefreshData();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit PR URL.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Trigger Verification manually
  const handleTriggerVerification = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await webApi.triggerVerification(taskId);
      setSuccessMsg('AI Verification pipeline initiated.');
      await fetchTask();
      onRefreshData();
    } catch (err: any) {
      setError(err?.message || 'Failed to trigger verification.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Release Payment
  const handleReleasePayment = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await webApi.releasePayment(taskId);
      setSuccessMsg('Payment released and captured via PayPal successfully!');
      await fetchTask();
      onRefreshData();
    } catch (err: any) {
      const isAlreadyReleased =
        err?.message?.includes('already in') ||
        err?.message?.includes('Duplicate release') ||
        err?.message?.includes('PAYMENT_ALREADY_CAPTURED');
      if (isAlreadyReleased) {
        setSuccessMsg('Payment is already captured / paid out.');
        await fetchTask();
        onRefreshData();
      } else {
        setError(err?.message || 'Failed to release escrow payment.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading bounty details...
      </div>
    );
  }

  if (!task) {
    return (
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--accent-red)', marginBottom: '16px' }}>Bounty not found.</p>
        <button
          onClick={() => onNavigate('home')}
          style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  // Developer assignment identification
  const assignedDev = task.assignedDeveloperId;
  const assignedDevId = assignedDev?._id ? assignedDev._id.toString() : assignedDev?.toString();
  const assignedDevName = assignedDev?.name || assignedDev?.githubUsername || 'Assigned Developer';
  const isClaimed = !!assignedDevId;
  const isClaimedByMe = !!(assignedDevId && user?.id && assignedDevId === user.id.toString());

  // 7 Lifecycle steps
  const timelineSteps = [
    { key: 'OPEN', num: 1, label: 'Open', desc: 'Awaiting developer claim' },
    { key: 'CLAIMED', num: 2, label: 'Claimed', desc: 'Developer assigned' },
    { key: 'SUBMITTED', num: 3, label: 'PR Submitted', desc: 'GitHub PR received' },
    { key: 'VERIFYING', num: 4, label: 'Verifying', desc: 'Gemini AI verification' },
    { key: 'AWAITING_REVIEW', num: 5, label: 'Awaiting Review', desc: 'Employer approval pending' },
    { key: 'APPROVED', num: 6, label: 'Approved', desc: 'Milestone verified' },
    { key: 'PAID', num: 7, label: 'Paid Out', desc: 'Escrow released via PayPal' }
  ];

  const getStageLabel = (stage?: string, status?: string) => {
    switch (stage) {
      case 'PR_RECEIVED':
      case 'SUBMITTED':
        return 'Pull Request Submitted';
      case 'PR_METADATA_FETCHED':
      case 'FETCHING_PR':
        return 'Fetching PR Metadata & Commits';
      case 'PR_FILES_FETCHED':
      case 'FETCHING_CHANGED_FILES':
        return 'Fetching Changed Files & Code Diffs';
      case 'SOURCE_CONTEXT_BUILT':
        return 'Assembling Code & Issue Context';
      case 'RUNNING_TESTS':
        return 'Running Container Sandbox Tests';
      case 'TESTS_PASSED':
        return 'Sandbox Tests Passed';
      case 'TESTS_FAILED':
        return 'Sandbox Tests Failed';
      case 'AI_RUNNING':
      case 'AI_ANALYZING':
        return 'Gemini Comparing Issue vs PR Implementation';
      case 'EVIDENCE_VALIDATED':
      case 'VALIDATING_EVIDENCE':
        return 'Validating Grounded Diff Citations';
      case 'REPORT_SAVED':
      case 'COMPLETED':
        return 'Verification Analysis Complete';
      case 'AI_FAILED':
      case 'FAILED':
        return 'Verification Encountered an Issue';
      case 'OUTDATED':
        return 'Outdated (Newer Commits Available)';
      default:
        if (status === 'EVALUATING') return 'Analyzing Code & Criteria...';
        return stage || 'Processing Verification...';
    }
  };

  const getStepIndex = (status: string, subList: any[] = []): number => {
    // Step 7: Paid Out (idx 6)
    if (status === TaskStatus.PAID || status === TaskStatus.PAYMENT_COMPLETED) {
      return 6;
    }
    // Step 6: Approved (idx 5)
    if (status === TaskStatus.APPROVED) {
      return 5;
    }
    // Step 5: Awaiting Review (idx 4)
    if (
      status === TaskStatus.AWAITING_REVIEW ||
      status === TaskStatus.AWAITING_EMPLOYER_APPROVAL ||
      status === TaskStatus.VERIFICATION_PASSED ||
      status === TaskStatus.VERIFICATION_FAILED ||
      status === TaskStatus.REVISION_REQUESTED ||
      subList.some(
        (s) =>
          s.status === 'PASSED' ||
          s.status === 'FAILED' ||
          s.currentStage === 'REPORT_SAVED' ||
          s.currentStage === 'COMPLETED'
      )
    ) {
      return 4;
    }
    // Step 4: Verifying (idx 3)
    if (
      status === TaskStatus.VERIFYING ||
      subList.some((s) => s.status === 'EVALUATING' || s.currentStage === 'AI_RUNNING' || s.currentStage === 'RUNNING_TESTS')
    ) {
      return 3;
    }
    // Step 3: PR Submitted (idx 2)
    if (status === TaskStatus.SUBMITTED || subList.length > 0) {
      return 2;
    }
    // Step 2: Claimed (idx 1)
    if (
      isClaimed ||
      status === TaskStatus.CLAIMED ||
      status === TaskStatus.ASSIGNED ||
      status === 'IN_PROGRESS' ||
      status === TaskStatus.IN_PROGRESS
    ) {
      return 1;
    }
    // Step 1: Open (idx 0)
    return 0;
  };

  const currentStepIdx = getStepIndex(task.status, submissions);
  const latestSubmission = submissions.length > 0 ? submissions[0] : null;

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '36px 20px' }}>
      {/* Top back navigation */}
      <button
        onClick={() => onNavigate('home')}
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
        Back to bounties
      </button>

      {/* Status Timeline */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--card-border)',
          padding: '18px 24px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          {timelineSteps.map((s, idx) => {
            const isCompleted = idx < currentStepIdx;
            const isCurrent = idx === currentStepIdx;
            const isClickable = (idx <= currentStepIdx && idx >= 2) || (idx === 6 && currentStepIdx === 6);

            return (
              <div
                key={s.key}
                onClick={() => {
                  if (idx >= 2 && idx <= 5 && submissions.length > 0) {
                    onNavigate('review', task._id);
                  } else if (idx === 6 && currentStepIdx === 6) {
                    onNavigate('activity');
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  zIndex: 2,
                  flex: 1,
                  cursor: isClickable ? 'pointer' : 'default',
                  opacity: idx > currentStepIdx ? 0.6 : 1,
                  transition: 'opacity 0.2s ease'
                }}
                title={s.desc}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: isCompleted
                      ? 'var(--accent-green)'
                      : isCurrent
                      ? 'var(--accent-blue)'
                      : 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                >
                  {isCompleted ? <Check size={14} /> : idx + 1}
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: isCurrent ? 700 : 500,
                    color: isCurrent
                      ? 'var(--text-primary)'
                      : isCompleted
                      ? 'var(--text-secondary)'
                      : 'var(--text-muted)',
                    textAlign: 'center'
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--accent-red)',
            fontSize: '13px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--accent-green)',
            fontSize: '13px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Grid: Details & Single Action Box */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Left Column: Issue Summary & Criteria */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Issue Summary Card */}
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              border: '1px solid var(--card-border)',
              padding: '24px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {task.githubIssueNumber && (
                <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  Issue #{task.githubIssueNumber}
                </span>
              )}
              {task.projectName && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  • {task.projectName}
                </span>
              )}
            </div>

            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
              {task.title}
            </h1>

            <div style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
              <GitHubMarkdownViewer content={task.description || 'No detailed issue body provided.'} />
            </div>
          </div>

          {/* Issue Scope & Verification Specification Card */}
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              border: '1px solid var(--card-border)',
              padding: '24px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {task.acceptanceCriteria && task.acceptanceCriteria.length > 0
                  ? `Acceptance Criteria Checklist (${task.acceptanceCriteria.length})`
                  : 'GitHub Issue Scope & Verification Specification'}
              </h3>
              {task.githubIssueUrl && (
                <a
                  href={task.githubIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: 'var(--accent-blue)',
                    textDecoration: 'none',
                    fontWeight: 500
                  }}
                >
                  View on GitHub <ExternalLink size={12} />
                </a>
              )}
            </div>

            {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {task.acceptanceCriteria.map((c: any, i: number) => (
                  <div
                    key={c.id || i}
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px'
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: '2px',
                        color: 'var(--text-muted)'
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {c.title}
                        </span>
                        {c.mandatory !== false ? (
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                            MANDATORY
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' }}>
                            OPTIONAL
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        {c.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.04)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.5'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  <ShieldCheck size={16} color="var(--accent-blue)" />
                  Issue-Driven Direct Verification
                </div>
                <p style={{ margin: '0 0 10px 0' }}>
                  This bounty uses the original GitHub issue as the single source of truth. OpenProofPay's AI verification engine directly compares submitted pull request code diffs against the issue's problem statement, required behavior, and edge cases.
                </p>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Submit a Pull Request linking to this repository to automatically initiate verification.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Amount & ONE Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Bounty Reward Card */}
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              border: '1px solid var(--card-border)',
              padding: '24px'
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Bounty Reward
            </span>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px', marginBottom: '6px' }}>
              ${task.paymentAmount} <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)' }}>{task.currency || 'USD'}</span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-green)' }} />
              Authorized PayPal Sandbox Hold
            </div>

            {/* ONE ACTION PER SCREEN */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              {/* Step 1: Open -> Developer Claim */}
              {currentStepIdx === 0 && (
                <div>
                  <button
                    onClick={handleClaim}
                    disabled={actionLoading}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--btn-primary-bg)',
                      color: 'var(--btn-primary-text)',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {actionLoading ? 'Claiming Bounty...' : 'Claim Bounty'}
                  </button>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
                    Atomic claim: Guarantees exclusive work allocation.
                  </p>
                </div>
              )}

              {/* Step 2: Claimed -> Submit PR */}
              {currentStepIdx === 1 && (
                <div>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--status-info-bg)',
                      border: '1px solid var(--status-info-border)',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      marginBottom: '14px'
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--status-info)', marginBottom: '2px' }}>
                      Bounty Claimed
                    </div>
                    <span>
                      Assigned to <strong>@{assignedDevName}</strong>
                    </span>
                  </div>

                  {(isClaimedByMe || isAdmin) ? (
                    <div>
                      {/* Auto-detected PRs from GitHub */}
                      {loadingPrs ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                          Scanning {repoOwner ? `${repoOwner}/${repoName}` : 'repository'} for open pull requests...
                        </div>
                      ) : availablePrs.length > 0 ? (
                        <div style={{ marginBottom: '12px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                            Open Pull Requests ({availablePrs.length}):
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                            {availablePrs.map((pr: any) => (
                              <button
                                key={pr.number}
                                type="button"
                                onClick={() => {
                                  setPrUrl(pr.htmlUrl || `https://github.com/${repoOwner}/${repoName}/pull/${pr.number}`);
                                  setShowPrInput(true);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: prUrl.includes(`/pull/${pr.number}`)
                                    ? 'rgba(59, 130, 246, 0.2)'
                                    : 'rgba(255, 255, 255, 0.03)',
                                  border: prUrl.includes(`/pull/${pr.number}`)
                                    ? '1px solid var(--accent-blue)'
                                    : '1px solid var(--border-color)',
                                  cursor: 'pointer',
                                  textAlign: 'left'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                  <GitPullRequest size={13} color="var(--accent-blue)" />
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    #{pr.number}
                                  </span>
                                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {pr.title}
                                  </span>
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: 600, whiteSpace: 'nowrap', marginLeft: '6px' }}>
                                  Select
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {showPrInput ? (
                        <div>
                          <input
                            type="url"
                            placeholder="https://github.com/.../pull/12"
                            value={prUrl}
                            onChange={(e) => setPrUrl(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: '6px',
                              backgroundColor: 'var(--input-bg)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              fontSize: '13px',
                              marginBottom: '10px',
                              outline: 'none'
                            }}
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => setShowPrInput(false)}
                              style={{
                                padding: '8px 12px',
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
                              onClick={handleSubmitPr}
                              disabled={actionLoading}
                              style={{
                                flex: 1,
                                padding: '8px 14px',
                                borderRadius: '6px',
                                backgroundColor: 'var(--btn-primary-bg)',
                                color: 'var(--btn-primary-text)',
                                border: 'none',
                                fontWeight: 600,
                                fontSize: '13px',
                                cursor: actionLoading ? 'not-allowed' : 'pointer',
                                boxShadow: 'var(--shadow-sm)',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {actionLoading ? 'Submitting...' : 'Submit PR for AI Verification'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowPrInput(true)}
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--btn-primary-bg)',
                            color: 'var(--btn-primary-text)',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: 'var(--shadow-sm)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <GitPullRequest size={16} />
                          {availablePrs.length > 0 ? 'Enter or Confirm PR URL' : 'Submit PR URL'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                      This bounty is currently claimed and in progress.
                    </p>
                  )}
                </div>
              )}

              {/* Step 3: PR Submitted */}
              {currentStepIdx === 2 && (
                <div>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--status-info-bg)',
                      border: '1px solid var(--status-info-border)',
                      fontSize: '12px',
                      marginBottom: '14px'
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--status-info)', marginBottom: '2px' }}>
                      PR Submitted
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      PR #{latestSubmission?.prNumber || 'active'} received from GitHub.
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      onClick={handleTriggerVerification}
                      disabled={actionLoading}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-text)',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: '14px',
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Sparkles size={16} />
                      {actionLoading ? 'Initiating Verification...' : 'Run Gemini AI Verification'}
                    </button>

                    <button
                      onClick={() => onNavigate('review', task._id)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        backgroundColor: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      View Review Workspace
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Verifying */}
              {currentStepIdx === 3 && (
                <div>
                  <div
                    style={{
                      padding: '16px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--status-info-bg)',
                      border: '1px solid var(--status-info-border)',
                      textAlign: 'center',
                      marginBottom: '14px'
                    }}
                  >
                    <Clock size={22} color="var(--status-info)" style={{ margin: '0 auto 8px auto' }} />
                    <div style={{ fontWeight: 700, color: 'var(--status-info)', fontSize: '14px' }}>
                      AI Verification in Progress
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {getStageLabel(latestSubmission?.currentStage, latestSubmission?.status)}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                      Gemini AI is analyzing code diffs, executing tests & validating criteria...
                    </p>
                  </div>

                  <button
                    onClick={() => onNavigate('review', task._id)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--btn-primary-bg)',
                      color: 'var(--btn-primary-text)',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Sparkles size={16} />
                    View Live Verification Pipeline
                  </button>
                </div>
              )}

              {/* Step 5: Awaiting Review */}
              {currentStepIdx === 4 && (
                <div>
                  <div
                    style={{
                      padding: '16px',
                      borderRadius: '8px',
                      backgroundColor:
                        task.status === TaskStatus.VERIFICATION_FAILED
                          ? 'var(--status-error-bg)'
                          : task.status === TaskStatus.REVISION_REQUESTED
                          ? 'var(--status-warning-bg)'
                          : 'var(--status-success-bg)',
                      border: `1px solid ${
                        task.status === TaskStatus.VERIFICATION_FAILED
                          ? 'var(--status-error-border)'
                          : task.status === TaskStatus.REVISION_REQUESTED
                          ? 'var(--status-warning-border)'
                          : 'var(--status-success-border)'
                      }`,
                      textAlign: 'center',
                      marginBottom: '14px'
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        color:
                          task.status === TaskStatus.VERIFICATION_FAILED
                            ? 'var(--status-error)'
                            : task.status === TaskStatus.REVISION_REQUESTED
                            ? 'var(--status-warning)'
                            : 'var(--status-success)',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        marginBottom: '4px'
                      }}
                    >
                      <ShieldCheck size={18} />
                      {task.status === TaskStatus.VERIFICATION_FAILED
                        ? 'Verification Flagged Issues'
                        : task.status === TaskStatus.REVISION_REQUESTED
                        ? 'Changes Requested by Employer'
                        : 'AI Verification Completed'}
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                      {isAdmin
                        ? 'Comprehensive issue vs. PR verification report ready for administrative review.'
                        : 'AI verification has completed comparing the Pull Request against the original GitHub issue.'}
                    </p>
                  </div>

                  <button
                    onClick={() => onNavigate('review', task._id)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--btn-primary-bg)',
                      color: 'var(--btn-primary-text)',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <ShieldCheck size={18} />
                    View Verification Results
                  </button>
                </div>
              )}

              {/* Step 6: Approved -> Employer Release Payment */}
              {currentStepIdx === 5 && (
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid var(--accent-green)',
                      color: 'var(--accent-green)',
                      fontWeight: 600,
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      marginBottom: '14px'
                    }}
                  >
                    <CheckCircle2 size={18} />
                    <span>Milestone Approved by Employer</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      onClick={() => onNavigate('review', task._id)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        backgroundColor: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <ShieldCheck size={16} />
                      View Verification Results
                    </button>

                    {isAdmin ? (
                      <div>
                        <button
                          onClick={handleReleasePayment}
                          disabled={actionLoading}
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--accent-green)',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '14px',
                            cursor: actionLoading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                          }}
                        >
                          <DollarSign size={16} />
                          {actionLoading ? 'Releasing Escrow...' : `Release $${task.paymentAmount} Escrow Payment`}
                        </button>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                          Captures PayPal escrow hold and releases payout to developer.
                        </p>
                      </div>
                    ) : (
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Awaiting PayPal escrow payout release by employer.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Step 7: Paid Out */}
              {currentStepIdx === 6 && (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <div style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <CheckCircle2 size={18} />
                    <span>Bounty Paid Out via PayPal</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    ${task.paymentAmount} {task.currency || 'USD'} safely settled.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
                    <button
                      onClick={() => onNavigate('review', task._id)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <ShieldCheck size={16} />
                      View Verification Results
                    </button>
                    <button
                      onClick={() => onNavigate('activity')}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      View in Activity Ledger
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Submissions List if any */}
          {submissions.length > 0 && (
            <div
              style={{
                backgroundColor: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid var(--card-border)',
                padding: '20px'
              }}
            >
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                PR Submissions ({submissions.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {submissions.map((sub: any) => (
                  <div
                    key={sub._id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        PR #{sub.prNumber}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {sub.headSha ? sub.headSha.slice(0, 7) : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                      {sub.prUrl ? (
                        <a href={sub.prUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          View on GitHub <ExternalLink size={11} />
                        </a>
                      ) : <span />}
                      {(sub.status === 'PASSED' || sub.status === 'FAILED' || sub.currentStage === 'REPORT_SAVED' || sub.currentStage === 'COMPLETED' || currentStepIdx >= 4) && (
                        <button
                          onClick={() => onNavigate('review', task._id)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--accent-blue)',
                            color: 'var(--accent-blue)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          View Verification Results
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
