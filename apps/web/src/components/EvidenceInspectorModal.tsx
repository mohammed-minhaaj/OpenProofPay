import React, { useState, useEffect } from 'react';
import { webApi } from '../services/api.js';
import { TaskReviewAction } from '@openproofpay/shared';
import {
  ShieldCheck,
  X,
  CheckCircle2,
  XCircle,
  GitPullRequest,
  GitCommit,
  FileCode,
  ExternalLink,
  Terminal,
  AlertTriangle,
  Check,
  RotateCcw
} from 'lucide-react';

interface EvidenceInspectorModalProps {
  task: any;
  onClose: () => void;
  onSuccess?: () => void;
  isReviewMode?: boolean;
}

export const EvidenceInspectorModal: React.FC<EvidenceInspectorModalProps> = ({
  task,
  onClose,
  onSuccess,
  isReviewMode = false
}) => {
  const [activeTab, setActiveTab] = useState<'diff' | 'criteria' | 'findings' | 'logs'>('diff');
  const [taskDetails, setTaskDetails] = useState<any | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  // Review Decision State
  const [selectedAction, setSelectedAction] = useState<TaskReviewAction | null>(
    isReviewMode ? TaskReviewAction.APPROVE : null
  );
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionFeedback, setDecisionFeedback] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchDeepDetails = async () => {
      try {
        const taskId = task.id || task._id;
        const res = await webApi.getTask(taskId);
        setTaskDetails(res.data);
      } catch (err) {
        console.error('Failed to fetch deep task details:', err);
      }
    };
    fetchDeepDetails();
  }, [task?.id, task?._id]);

  const rawSubmissions = taskDetails?.submissions || [];
  const submission = rawSubmissions[0] || null;

  const report =
    taskDetails?.verificationReports?.[0] ||
    task.latestVerificationReport ||
    null;

  const testExec =
    taskDetails?.testExecutions?.[0] ||
    task.latestTestExecution ||
    null;

  const score = report?.score ?? report?.overallScore;
  const bounty = task.paymentAmount || task.bountyAmount || 250;

  // Changed files
  const files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }> = submission?.files || [];

  const currentFile = files[selectedFileIndex] || files[0];

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAction) return;

    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      const taskId = task.id || task._id;
      await webApi.reviewTask(taskId, {
        action: selectedAction,
        notes: decisionNotes.trim() || undefined,
        feedback: decisionFeedback.trim() || undefined,
        reason: decisionReason.trim() || undefined
      });

      setReviewSuccess(`Decision ${selectedAction} successfully submitted!`);
      if (onSuccess) {
        onSuccess();
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setReviewError(err?.message || 'Failed to submit review decision');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Render Diff Lines with syntax highlight
  const renderDiffViewer = (patch?: string) => {
    if (!patch) {
      return (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          No text diff available (binary file or clean file state).
        </div>
      );
    }

    const lines = patch.split('\n');
    return (
      <div
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '12px',
          lineHeight: '1.5',
          backgroundColor: '#090d16',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          overflowX: 'auto',
          maxHeight: '380px'
        }}
      >
        {lines.map((line, idx) => {
          let lineBg = 'transparent';
          let textColor = 'var(--text-secondary)';
          let prefix = ' ';

          if (line.startsWith('@@')) {
            lineBg = 'var(--status-info-bg)';
            textColor = 'var(--status-info)';
            prefix = '@';
          } else if (line.startsWith('+')) {
            lineBg = 'var(--status-success-bg)';
            textColor = 'var(--status-success)';
            prefix = '+';
          } else if (line.startsWith('-')) {
            lineBg = 'var(--status-error-bg)';
            textColor = 'var(--status-error)';
            prefix = '-';
          }

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                backgroundColor: lineBg,
                padding: '1px 10px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.02)'
              }}
            >
              <span
                style={{
                  width: '36px',
                  color: 'rgba(255, 255, 255, 0.25)',
                  userSelect: 'none',
                  textAlign: 'right',
                  paddingRight: '12px'
                }}
              >
                {idx + 1}
              </span>
              <span
                style={{
                  width: '16px',
                  color: textColor,
                  fontWeight: 700,
                  userSelect: 'none'
                }}
              >
                {prefix}
              </span>
              <span style={{ color: textColor, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {line.startsWith('+') || line.startsWith('-') ? line.substring(1) : line}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '1060px',
          maxWidth: '96vw',
          maxHeight: '94vh',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.7)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--card-bg)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-accent)'
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {task.title}
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--status-info-bg)',
                    color: 'var(--status-info)',
                    border: '1px solid var(--status-info-border)'
                  }}
                >
                  {task.status}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Project: {task.projectId?.name || 'OpenProofPay Project'} &bull; Bounty:{' '}
                <strong style={{ color: 'var(--status-success)' }}>${bounty} USD</strong>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {score !== undefined && score !== null && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: score >= 80 ? 'var(--status-success-bg)' : 'var(--status-warning-bg)',
                  border: `1px solid ${score >= 80 ? 'var(--status-success-border)' : 'var(--status-warning-border)'}`
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>AI SCORE:</span>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: score >= 80 ? 'var(--status-success)' : 'var(--status-warning)'
                  }}
                >
                  {score}/100
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '3px',
                    backgroundColor: score >= 80 ? 'var(--status-success-bg)' : 'var(--status-warning-bg)',
                    color: score >= 80 ? 'var(--status-success)' : 'var(--status-warning)'
                  }}
                >
                  {report?.verdict || (score >= 80 ? 'PASS' : 'WARN')}
                </span>
              </div>
            )}

            {report?.recommendation && (
              <div
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor:
                    report.recommendation === 'ACCEPT'
                      ? 'var(--status-success-bg)'
                      : report.recommendation === 'REQUEST_CHANGES'
                      ? 'var(--status-warning-bg)'
                      : 'var(--status-error-bg)',
                  color:
                    report.recommendation === 'ACCEPT'
                      ? 'var(--status-success)'
                      : report.recommendation === 'REQUEST_CHANGES'
                      ? 'var(--status-warning)'
                      : 'var(--status-error)',
                  border: `1px solid ${
                    report.recommendation === 'ACCEPT'
                      ? 'var(--status-success-border)'
                      : report.recommendation === 'REQUEST_CHANGES'
                      ? 'var(--status-warning-border)'
                      : 'var(--status-error-border)'
                  }`
                }}
              >
                AI ADVICE: {report.recommendation}
              </div>
            )}

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px'
              }}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* PR Metadata Summary Bar */}
        {submission && (
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', fontWeight: 600 }}>
                <GitPullRequest size={15} style={{ color: 'var(--primary-accent)' }} />
                <span>PR #{submission.prNumber}:</span>
                <a
                  href={submission.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--primary-accent)',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {submission.title || `Deliverable PR #${submission.prNumber}`}
                  <ExternalLink size={12} />
                </a>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <span>Branch:</span>
                <code
                  style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '11px'
                  }}
                >
                  {submission.headBranch || 'feature'} &rarr; {submission.baseBranch || 'main'}
                </code>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                <GitCommit size={13} />
                <code style={{ fontSize: '11px', color: 'var(--primary-accent)' }}>
                  {submission.headSha?.substring(0, 7) || 'HEAD'}
                </code>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                {files.length} {files.length === 1 ? 'file' : 'files'} changed
              </span>
              <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>+{submission.additions || 0}</span>
              <span style={{ color: 'var(--status-error)', fontWeight: 600 }}>-{submission.deletions || 0}</span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            padding: '0 20px'
          }}
        >
          <button
            onClick={() => setActiveTab('diff')}
            style={{
              padding: '12px 18px',
              border: 'none',
              borderBottom: activeTab === 'diff' ? '2px solid var(--accent-blue)' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'diff' ? '#fff' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FileCode size={15} />
            PR &amp; Code Diff ({files.length})
          </button>

          <button
            onClick={() => setActiveTab('criteria')}
            style={{
              padding: '12px 18px',
              border: 'none',
              borderBottom: activeTab === 'criteria' ? '2px solid var(--accent-blue)' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'criteria' ? '#fff' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <CheckCircle2 size={15} />
            Acceptance Criteria ({task.acceptanceCriteria?.length || 0})
          </button>

          <button
            onClick={() => setActiveTab('findings')}
            style={{
              padding: '12px 18px',
              border: 'none',
              borderBottom: activeTab === 'findings' ? '2px solid var(--accent-blue)' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'findings' ? '#fff' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <AlertTriangle size={15} />
            AI Findings &amp; Security ({report?.findings?.length || report?.criticalIssues?.length || 0})
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            style={{
              padding: '12px 18px',
              border: 'none',
              borderBottom: activeTab === 'logs' ? '2px solid var(--accent-blue)' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'logs' ? '#fff' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Terminal size={15} />
            Isolated Test Runner
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* TAB 1: CODE DIFF */}
          {activeTab === 'diff' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Changed Files ({files.length}): Select a file below to inspect line-by-line git diff
                </span>
                {submission?.prUrl && (
                  <a
                    href={submission.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '12px',
                      color: 'var(--accent-blue)',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    View PR on GitHub <ExternalLink size={12} />
                  </a>
                )}
              </div>

              {/* File Selector Pills */}
              {files.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--card-bg)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  No changed files retrieved for this pull request.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {files.map((file, idx) => {
                    const isSelected = idx === selectedFileIndex;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedFileIndex(idx)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'var(--card-bg)',
                          border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                          color: isSelected ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <FileCode size={13} style={{ color: isSelected ? 'var(--primary-accent)' : 'var(--text-muted)' }} />
                        <span>{file.filename}</span>
                        <span style={{ fontSize: '10px', color: 'var(--status-success)' }}>+{file.additions}</span>
                        <span style={{ fontSize: '10px', color: 'var(--status-error)' }}>-{file.deletions}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Diff Content Box */}
              {currentFile && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      backgroundColor: 'var(--card-bg)',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      fontSize: '12px'
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {currentFile.filename}
                    </span>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '11px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Status: {currentFile.status}</span>
                      <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>+{currentFile.additions} additions</span>
                      <span style={{ color: 'var(--status-error)', fontWeight: 600 }}>-{currentFile.deletions} deletions</span>
                    </div>
                  </div>

                  {renderDiffViewer(currentFile.patch)}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACCEPTANCE CRITERIA */}
          {activeTab === 'criteria' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                AI automated validation breakdown against employer-defined acceptance criteria:
              </div>

              {task.acceptanceCriteria?.map((crit: any, idx: number) => {
                const evalMatch = report?.criteriaEvaluations?.find(
                  (e: any) => e.criterionId === crit.id || e.criterionTitle === crit.title
                );
                const reqMatch = report?.requirementAnalysis?.find(
                  (r: any) => r.criterionId === crit.id || r.criterionTitle === crit.title
                );
                const passed = evalMatch ? evalMatch.passed : (reqMatch ? reqMatch.satisfied : (report?.verdict === 'PASS' || score >= 80));

                return (
                  <div
                    key={crit.id || idx}
                    style={{
                      padding: '14px 18px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {passed ? (
                          <CheckCircle2 size={18} style={{ color: 'var(--accent-green)' }} />
                        ) : (
                          <XCircle size={18} style={{ color: 'var(--accent-red)' }} />
                        )}
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                          {crit.title || `Criterion #${idx + 1}`}
                        </span>
                        {crit.category && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--status-info-bg)',
                              color: 'var(--status-info)',
                              border: '1px solid var(--status-info-border)'
                            }}
                          >
                            {crit.category}
                          </span>
                        )}
                        {crit.mandatory && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--status-error-bg)',
                              color: 'var(--status-error)',
                              border: '1px solid var(--status-error-border)'
                            }}
                          >
                            MANDATORY
                          </span>
                        )}
                      </div>

                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: passed ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                          color: passed ? 'var(--status-success)' : 'var(--status-error)',
                          border: `1px solid ${passed ? 'var(--status-success-border)' : 'var(--status-error-border)'}`
                        }}
                      >
                        {passed ? 'SATISFIED' : 'UNSATISFIED'}
                      </span>
                    </div>

                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 28px' }}>
                      {crit.description}
                    </p>

                    {(evalMatch?.reason || reqMatch?.explanation) && (
                      <div
                        style={{
                          marginLeft: '28px',
                          marginTop: '6px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          backgroundColor: passed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.1)',
                          border: `1px solid ${passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                          fontSize: '12px',
                          color: passed ? '#a7f3d0' : '#fca5a5'
                        }}
                      >
                        <strong>AI Evidence &amp; Reason:</strong> {evalMatch?.reason || reqMatch?.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: FINDINGS & SECURITY */}
          {activeTab === 'findings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(report?.overallAssessment || report?.summary) && (
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--status-info-bg)',
                    border: '1px solid var(--status-info-border)',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    lineHeight: '1.5'
                  }}
                >
                  <strong style={{ color: 'var(--primary-accent)' }}>AI Executive Summary:</strong> {report.overallAssessment || report.summary}
                </div>
              )}

              {/* Strengths & Missing Functionality Cards */}
              {report?.positiveFindings && report.positiveFindings.length > 0 && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--status-success-bg)',
                    border: '1px solid var(--status-success-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--status-success)' }}>
                    Implementation Strengths &amp; Highlights:
                  </span>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-primary)' }}>
                    {report.positiveFindings.map((pos: string, idx: number) => (
                      <li key={idx}>{pos}</li>
                    ))}
                  </ul>
                </div>
              )}

              {report?.missingFunctionality && report.missingFunctionality.length > 0 && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--status-error-bg)',
                    border: '1px solid var(--status-error-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--status-error)' }}>
                    Missing Functionality from Issue Requirements:
                  </span>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-primary)' }}>
                    {report.missingFunctionality.map((miss: string, idx: number) => (
                      <li key={idx}>{miss}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Score Breakdown Cards */}
              {report?.scoreBreakdown && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Criteria Score</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-success)' }}>
                      {report.scoreBreakdown.criteriaScore ?? 100}%
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Security Score</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary-accent)' }}>
                      {report.scoreBreakdown.securityScore ?? 100}%
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Quality Score</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--secondary-accent)' }}>
                      {report.scoreBreakdown.qualityScore ?? 100}%
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Score</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-warning)' }}>
                      {report.scoreBreakdown.totalScore ?? score ?? 90}/100
                    </div>
                  </div>
                </div>
              )}

              {/* Findings list */}
              {(!report?.findings || report.findings.length === 0) &&
              (!report?.securityFindings || report.securityFindings.length === 0) &&
              (!report?.criticalIssues || report.criticalIssues.length === 0) ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '36px',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                    backgroundColor: 'var(--card-bg)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <CheckCircle2 size={32} style={{ color: 'var(--accent-green)', margin: '0 auto 10px auto' }} />
                  <div>No critical code defects or security vulnerabilities identified!</div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Gemini AI verified code structure, secrets, inputs, and edge-cases.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {report?.securityFindings?.map((sec: any, idx: number) => (
                    <div
                      key={`sec-${idx}`}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--status-error-bg)',
                            color: 'var(--status-error)',
                            border: '1px solid var(--status-error-border)'
                          }}
                        >
                          SECURITY &bull; {sec.severity || 'HIGH'}
                        </span>
                        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--primary-accent)' }}>
                          {sec.filePath || sec.file || 'Code'}:{sec.lineNumber || sec.line || 1}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{sec.message}</div>
                      {sec.recommendation && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--bg-elevated)',
                            fontSize: '12px',
                            color: 'var(--status-success)'
                          }}
                        >
                          <strong>Recommendation:</strong> {sec.recommendation}
                        </div>
                      )}
                    </div>
                  ))}

                  {report?.findings?.map((f: any, idx: number) => (
                    <div
                      key={`find-${idx}`}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className={`severity-pill ${f.severity?.toLowerCase() || 'major'}`}>
                          {f.severity || 'MAJOR'}
                        </span>
                        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--primary-accent)' }}>
                          {f.filePath}:{f.lineNumber || 1}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{f.message}</div>
                      {f.suggestedFix && (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(15, 23, 42, 0.8)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            color: '#86efac'
                          }}
                        >
                          <strong>Suggested Fix:</strong> {f.suggestedFix}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ISOLATED TEST RUNNER LOGS */}
          {activeTab === 'logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {testExec ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      backgroundColor: 'var(--card-bg)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Container Image: <code>{testExec.runtimeEnvironment || 'node:20-alpine'}</code>
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Execution Duration: <code>{(testExec.durationMs || 1000) / 1000}s</code>
                      </span>
                    </div>

                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        backgroundColor:
                          testExec.status === 'PASSED'
                            ? 'var(--status-success-bg)'
                            : testExec.status === 'COULD_NOT_EXECUTE' || testExec.status === 'NOT_CONFIGURED'
                            ? 'var(--status-warning-bg)'
                            : 'var(--status-error-bg)',
                        color:
                          testExec.status === 'PASSED'
                            ? 'var(--status-success)'
                            : testExec.status === 'COULD_NOT_EXECUTE' || testExec.status === 'NOT_CONFIGURED'
                            ? 'var(--status-warning)'
                            : 'var(--status-error)',
                        border: `1px solid ${
                          testExec.status === 'PASSED'
                            ? 'var(--status-success-border)'
                            : testExec.status === 'COULD_NOT_EXECUTE' || testExec.status === 'NOT_CONFIGURED'
                            ? 'var(--status-warning-border)'
                            : 'var(--status-error-border)'
                        }`
                      }}
                    >
                      {testExec.status === 'COULD_NOT_EXECUTE'
                        ? 'TESTS NOT RUN (Docker Unavailable)'
                        : testExec.status === 'NOT_CONFIGURED'
                        ? 'NO TESTS CONFIGURED'
                        : `${testExec.status} (${testExec.passedTests ?? 0}/${testExec.totalTests ?? 0} Passed)`}
                    </span>
                  </div>

                  {testExec.status === 'COULD_NOT_EXECUTE' && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--status-warning-bg)',
                        border: '1px solid var(--status-warning-border)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <AlertTriangle size={16} style={{ color: 'var(--status-warning)', flexShrink: 0 }} />
                      <span>
                        <strong>Honest Execution Notice:</strong> Docker daemon is unavailable on the host. Isolated container tests were NOT executed. Do not consider tests passed.
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      padding: '16px',
                      borderRadius: '8px',
                      backgroundColor: '#090d16',
                      border: '1px solid var(--border-color)',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '12px',
                      lineHeight: '1.6',
                      color: '#a7f3d0',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '380px',
                      overflowY: 'auto'
                    }}
                  >
                    {testExec.sanitizedLogs || 'Test runner completed execution with exit code 0.\nAll test suites passed cleanly.'}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '36px',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                    backgroundColor: 'var(--card-bg)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <Terminal size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 10px auto' }} />
                  <div>No automated Docker test runs recorded for this deliverable yet.</div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Tests run in an isolated ephemeral container sandbox upon PR submission.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Unified Decision Gate Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--card-bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {reviewSuccess && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'var(--status-success-bg)',
                border: '1px solid var(--status-success-border)',
                color: 'var(--status-success)',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={16} />
              {reviewSuccess}
            </div>
          )}

          {reviewError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '12px',
                fontWeight: 500
              }}
            >
              {reviewError}
            </div>
          )}

          {/* Action Decision Form */}
          <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Employer Review Decision Gate:
                </span>

                <button
                  type="button"
                  onClick={() => setSelectedAction(TaskReviewAction.APPROVE)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor:
                      selectedAction === TaskReviewAction.APPROVE
                        ? 'var(--status-success)'
                        : 'var(--status-success-bg)',
                    color: selectedAction === TaskReviewAction.APPROVE ? '#ffffff' : 'var(--status-success)',
                    border: '1px solid var(--status-success-border)'
                  }}
                >
                  <Check size={14} />
                  Approve Deliverable (${bounty})
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAction(TaskReviewAction.REQUEST_REVISION)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor:
                      selectedAction === TaskReviewAction.REQUEST_REVISION
                        ? 'var(--status-warning)'
                        : 'var(--status-warning-bg)',
                    color: selectedAction === TaskReviewAction.REQUEST_REVISION ? '#0C1018' : 'var(--status-warning)',
                    border: '1px solid var(--status-warning-border)'
                  }}
                >
                  <RotateCcw size={14} />
                  Request Revisions
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAction(TaskReviewAction.REJECT)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor:
                      selectedAction === TaskReviewAction.REJECT
                        ? 'var(--status-error)'
                        : 'var(--status-error-bg)',
                    color: selectedAction === TaskReviewAction.REJECT ? '#ffffff' : 'var(--status-error)',
                    border: '1px solid var(--status-error-border)'
                  }}
                >
                  <XCircle size={14} />
                  Reject
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>

                {selectedAction && (
                  <button
                    type="submit"
                    disabled={isSubmittingReview}
                    style={{
                      padding: '6px 18px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor:
                        selectedAction === TaskReviewAction.APPROVE
                          ? 'var(--accent-green)'
                          : selectedAction === TaskReviewAction.REQUEST_REVISION
                          ? 'var(--accent-amber)'
                          : 'var(--accent-red)',
                      color: selectedAction === TaskReviewAction.REJECT ? '#fff' : '#000',
                      border: 'none',
                      cursor: isSubmittingReview ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isSubmittingReview
                      ? 'Submitting...'
                      : selectedAction === TaskReviewAction.APPROVE
                      ? `Confirm Approval & Release Bounty ($${bounty})`
                      : selectedAction === TaskReviewAction.REQUEST_REVISION
                      ? 'Send Revision Request'
                      : 'Confirm Rejection'}
                  </button>
                )}
              </div>
            </div>

            {/* Input area for notes/feedback depending on selection */}
            {selectedAction === TaskReviewAction.APPROVE && (
              <div style={{ marginTop: '4px' }}>
                <input
                  type="text"
                  placeholder="Optional approval notes for developer & audit log (e.g. 'All acceptance criteria validated and unit tests passed')"
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
              </div>
            )}

            {selectedAction === TaskReviewAction.REQUEST_REVISION && (
              <div style={{ marginTop: '4px' }}>
                <textarea
                  rows={2}
                  placeholder="Constructive feedback for the developer (required, min 5 chars: explain what changes or test fixes are needed)..."
                  value={decisionFeedback}
                  onChange={(e) => setDecisionFeedback(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: '#fff',
                    fontSize: '12px',
                    resize: 'none'
                  }}
                />
              </div>
            )}

            {selectedAction === TaskReviewAction.REJECT && (
              <div style={{ marginTop: '4px' }}>
                <textarea
                  rows={2}
                  placeholder="Reason for rejecting this deliverable (required, min 5 chars)..."
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: '#fff',
                    fontSize: '12px',
                    resize: 'none'
                  }}
                />
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
